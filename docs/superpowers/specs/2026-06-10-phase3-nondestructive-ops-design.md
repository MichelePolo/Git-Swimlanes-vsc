# Fase 3 — Operazioni non distruttive (design)

> Stato: approvato. Terzo ciclo della roadmap "da sola-lettura a gestione GIT"
> (`docs/superpowers/specs/2026-06-09-git-management-roadmap.md`). Prime azioni che **scrivono**
> su ref locali e working tree, **senza riscrivere la cronologia**. Montano sulla convenzione
> `runGitAction` della Fase 2. Decisioni dal brainstorming (companion visivo):
> trigger **ibrido** (menu contestuale su commit + etichetta di corsia, toolbar per le azioni
> globali); input nomi via **prompt nativo dell'IDE**; working tree sporco → **fidati di git,
> mostra l'errore**; conferme **minime** (Push e delete; heads-up sul checkout in detached —
> create usa il solo prompt nome come gesto); **delete branch/tag incluso** (delete sicura).

## 1. Obiettivo

Portare il plugin dalla sola lettura/azioni-sicure (Fasi 1-2) alla **gestione dei ref locali**:
- **Crea branch / tag** da un commit qualsiasi.
- **Elimina branch / tag** (delete sicura).
- **Checkout / switch** a un branch o a un commit (detached).
- **Push** del branch corrente (+ `-u`, `--tags`).

Nessuna mutazione di cronologia (merge, rebase, commit, revert, reset → Fase 4). Nessun
`reset --hard` / force-push / force-delete.

## 2. Architettura — estensione della convenzione azioni

Niente dispatcher generico: ogni operazione è un **messaggio `Wv2Host` tipizzato con argomenti**
+ un handler host che (a) opzionalmente raccoglie input/conferma con dialoghi **nativi**, (b)
esegue git via l'helper `runGitAction(label, block)` già introdotto in Fase 2 (successo →
`refresh()` + notifica info; errore → notifica warning). Il **motore resta deterministico**: i
menu e i pulsanti emettono solo callback; tutta la logica git vive negli host.

Conseguenza chiave: **nessun nuovo messaggio `Host2Wv`**. Il risultato di ogni azione è già
trasmesso dal `refresh()` esistente (rilancia `git log` → ripost `setLog`/`status`/`viewConfig`),
che riflette naturalmente i nuovi ref e lo spostamento di HEAD. Il push non cambia il log locale:
basta la notifica.

## 3. Contratto — messaggi webview→host (`Wv2Host`)

```ts
| { type: "createBranch"; hash: string }            // host: prompt nome → git branch <name> <hash>
| { type: "createTag";    hash: string }            // host: prompt nome → git tag <name> <hash>
| { type: "deleteBranch"; name: string }            // host: conferma → git branch -d <name>
| { type: "deleteTag";    name: string }            // host: conferma → git tag -d <name>
| { type: "checkout"; target: string; detach: boolean } // git switch [--detach] <target>
| { type: "push" }                                  // host: rileva upstream + conferma con opzione tag
```

Nessuna aggiunta a `Host2Wv`.

## 4. Trigger (modello ibrido)

- **Click destro su un nodo commit** → menu contestuale:
  - *Crea branch qui* → `onCreateBranch(hash)`
  - *Crea tag qui* → `onCreateTag(hash)`
  - *Checkout questo commit* → `onCheckout(hash, detach=true)` (HEAD detached → heads-up host)
  - per ogni tag sul commit (`commit.tags`): *Elimina tag "&lt;t&gt;"* → `onDeleteTag(t)`
- **Click destro su un'etichetta di corsia** (solo corsie di branch reali — **escluse** le
  pseudo-corsie `hidden` e `(no branch ref)`):
  - *Switch a "&lt;branch&gt;"* → `onCheckout(branch, detach=false)`
  - *Elimina branch "&lt;branch&gt;"* → `onDeleteBranch(branch)`
- **Toolbar** (accanto a Pull/Fetch/Branches della Fase 2):
  - *⎇ Nuovo branch* (da HEAD, prompt nome) → `onCreateBranch(headHash)`
  - *⇡ Push* → `onPush()`

**Un solo comportamento di create-branch ovunque:** `git branch <name> <commit>` — crea **senza**
fare switch (prevedibile, non sorprende). Per lavorarci sopra, l'utente fa switch dall'etichetta
della nuova corsia. (Evita il bivio crea-vs-crea-e-switch.)

## 5. Motore — UI

- Nuovo componente **`ui/ContextMenu.tsx`**: menu HTML posizionato (coordinate del click), voci
  `{ label, onSelect, danger? }`, si chiude su click esterno o `Escape`. Le voci `danger`
  (delete) hanno stile distinto.
- **`GitSwimlanes.tsx`**: stato `menu` (posizione + voci) gestito localmente; `onContextMenu` sui
  nodi commit e sulle etichette di corsia costruisce le voci pertinenti (vedi §4) e apre il menu;
  le voci e i pulsanti toolbar invocano le callback. `assignLanes`/layout **invariati**.
- I nodi commit (in `Graph.tsx`/`Row.tsx`) e le etichette (`LaneHeader.tsx`) espongono un hook
  `onContextMenu(commitHash | laneLabel, event)` verso `GitSwimlanes`.
- Nuove prop di `GitSwimlanes` (tutte opzionali; assenti → nessun trigger, retrocompatibile):
  `onCreateBranch(hash)`, `onCreateTag(hash)`, `onDeleteBranch(name)`, `onDeleteTag(name)`,
  `onCheckout(target, detach)`, `onPush()`. Il menu su un commit/etichetta compare solo se le
  callback rilevanti sono presenti.
- **`webview.ts`**: mappa le callback ai post tipizzati (es. `onCheckout: (target, detach) =>
  host.post({ type: "checkout", target, detach })`).

## 6. Host — handler

`GitService` (entrambi gli host) guadagna:
- `createBranch(name, hash)` → `git branch <name> <hash>`
- `createTag(name, hash)` → `git tag <name> <hash>`
- `deleteBranch(name)` → `git branch -d <name>` (delete sicura: rifiuta i branch non mergeati)
- `deleteTag(name)` → `git tag -d <name>`
- `switchRef(target, detach)` → `git switch --detach <target>` se detach, altrimenti `git switch <target>`
- `currentBranchInfo()` → `{ branch, hasUpstream, remote }` (per il push)
- `push(tags)` → se `hasUpstream`: `git push`; altrimenti `git push -u <remote> <branch>`. Se
  `tags`: aggiunge `git push --tags`.

Handler nel provider/panel (UX nativa):
- **createBranch / createTag**: input box nativo (VS Code `showInputBox`, IntelliJ
  `Messages.showInputDialog`) — validazione leggera: nome non vuoto/senza spazi; i nomi malformati
  li rifiuta git (`check-ref-format`) → warning. Se confermato → `runGitAction`.
- **deleteBranch / deleteTag**: conferma nativa (sì/no) — **non** c'è il gesto del prompt nome, quindi
  serve una conferma esplicita → `runGitAction`. Delete sicura: un branch non mergeato fa fallire
  `-d` → warning (niente `-D` in questa fase).
- **checkout**: se `detach`, heads-up nativo ("Passerai a HEAD detached") → `runGitAction`. Switch a
  branch: nessuna conferma.
- **push**: `currentBranchInfo()` → conferma nativa a più pulsanti **[Push] [Push + tag] [Annulla]**
  (copre `--tags`) → `runGitAction` con la variante scelta.

## 7. Error/result UX
Tutto via `runGitAction`: successo → `refresh()` + notifica info; errore → notifica warning.
Errori notevoli, tutti **mostrati** (mai forzati): branch/tag già esistente; `-d` su branch non
mergeato; switch rifiutato (modifiche locali sovrascritte); push rifiutato (non fast-forward);
push senza remote/upstream (gestito con `-u`, o errore se manca il remote). Dialoghi nativi per
prompt/conferme. Push e checkout-in-detached sono gli unici percorsi con conferma.

## 8. Determinismo / purezza del motore
Il motore non cambia nella logica di modello: dato `(log + viewConfig)` corsie/colori/posizioni
restano identici. Menu e toolbar emettono solo callback. Le mutazioni si riflettono **solo**
attraverso il `git log` rifresato dall'host. Il cardine §1 della spec del motore regge.

## 9. Casi limite
| Caso | Comportamento |
|---|---|
| Commit senza tag | nessuna voce "Elimina tag" |
| Pseudo-corsia (`hidden` / `(no branch ref)`) | nessun menu di switch/delete sull'etichetta |
| HEAD già detached | switch a un branch funziona; "Checkout questo commit" resta valido |
| Repo vuoto (nessun HEAD) | toolbar "Nuovo branch da HEAD" disabilitato/assente |
| Nome ref non valido | git lo rifiuta → warning |
| Elimina branch corrente | git rifiuta → warning |
| Elimina branch non mergeato | `-d` rifiuta → warning (no force) |
| Push senza remote | errore mostrato |
| Cambio repo | `refresh()` riallinea tutto al nuovo repo (Fase 1-2) |

## 10. Testing
- **`ContextMenu`** (jsdom, TDD): rende le voci con le label corrette; click su una voce invoca
  `onSelect` e chiude; `Escape` e click esterno chiudono; le voci `danger` hanno la classe distinta.
- **`GitSwimlanes`** (jsdom, TDD): click destro su un nodo commit apre il menu con le voci attese
  (incl. "Elimina tag" per i tag del commit); click destro su un'etichetta di branch reale offre
  switch+delete; una pseudo-corsia non apre il menu; i pulsanti toolbar "Nuovo branch"/"Push"
  invocano le callback. Le callback assenti nascondono i trigger.
- **contratto**: solo tipi (nessuna logica).
- **host**: `tsc --noEmit` / `compileKotlin`; verifica browser che i trigger postino i messaggi
  tipizzati corretti (prompt/conferme native verificati a mano).

## 11. File toccati (stima)
- `packages/contract/src/index.ts` — 6 messaggi `Wv2Host`.
- `packages/engine/src/ui/ContextMenu.tsx` — nuovo.
- `packages/engine/src/ui/GitSwimlanes.tsx` — stato menu + wiring + toolbar + nuove prop/callback.
- `packages/engine/src/ui/Graph.tsx` / `Row.tsx` / `LaneHeader.tsx` — hook `onContextMenu`.
- `packages/engine/src/webview.ts` — mappa callback → post tipizzati.
- `packages/engine/src/engine.css` — stile del context menu (incl. voci `danger`).
- `packages/vscode/src/GitService.ts` (metodi git + `currentBranchInfo`),
  `SwimlanesViewProvider.ts` (handler con prompt/conferme native).
- `intellij/.../GitService.kt` (metodi git + `currentBranchInfo`),
  `SwimlanesPanel.kt` (handler con prompt/conferme native).

## 12. Fuori scope (Fase 3)
Force-delete (`-D`), force-push, `reset --hard`, amend; merge, rebase, commit, revert,
cherry-pick, reset di un commit (→ Fase 4); stash; rinomina branch; gestione remoti; rebase
interattivo e UI di risoluzione conflitti (delegati all'IDE nativo).
