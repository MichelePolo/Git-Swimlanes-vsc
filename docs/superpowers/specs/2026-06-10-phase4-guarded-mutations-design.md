# Fase 4 — Mutazioni guardate (design)

> Stato: approvato. Quarto e ultimo ciclo della roadmap "da sola-lettura a gestione GIT"
> (`docs/superpowers/specs/2026-06-09-git-management-roadmap.md`). Mutazioni di cronologia
> **guardate** (conferma esplicita, surfacing di conflitti, hint di undo via reflog). Montano
> sulla convenzione `runGitAction` (Fase 2) e sul context menu (Fase 3). Decisioni dal
> brainstorming: ambito = **revert + cherry-pick + reset** (commit rinviato all'IDE nativo);
> conflitti → **lasciati in-progress per l'IDE + pulsante Annulla**; reset = **ancorato al grafo,
> a un commit selezionato, con scelta soft/mixed**; undo = **hint da reflog nella notifica**.

## 1. Obiettivo

Completare la gestione GIT con le tre mutazioni di cronologia **ancorate al grafo** — scegli un
commit e agisci su di esso:
- **Revert** di un commit (crea un commit che ne annulla le modifiche).
- **Cherry-pick** di un commit sul branch corrente.
- **Reset** del branch corrente a un commit selezionato (soft/mixed — mai `--hard`).

Tutte **guardate**: conferma esplicita, errori/conflitti mostrati, hint di ripristino via reflog.
**Commit rinviato**: non è ancorato al grafo (agisce sul working tree) e l'UI di commit nativa
dell'IDE è più ricca (staging, hunk parziali, amend).

## 2. Architettura — estensione della convenzione azioni

Come la Fase 3: ogni operazione è un **messaggio `Wv2Host` tipizzato** con l'`hash` del commit +
un handler host che (a) **conferma con dialoghi nativi**, (b) esegue git via `runGitAction`
(successo → `refresh()` + notifica; errore → warning), (c) su successo aggiunge un **hint di undo
da reflog** alla notifica. Il motore resta deterministico (menu → callback).

Novità: **stato del sequencer**. Revert e cherry-pick possono fermarsi a metà su conflitto; l'host
rileva l'operazione in corso (`REVERT_HEAD` / `CHERRY_PICK_HEAD`) e offre **Annulla operazione**
(`--abort`). Nessun nuovo messaggio `Host2Wv`: i risultati passano dal `refresh()` esistente; i file
in conflitto compaiono nella pseudo-riga working-tree (Fase 2) con codice `U`.

## 3. Contratto — messaggi webview→host (`Wv2Host`)

```ts
| { type: "revert"; hash: string }      // git revert --no-edit <hash>
| { type: "cherryPick"; hash: string }  // git cherry-pick <hash>
| { type: "resetTo"; hash: string }     // host: dialogo soft/mixed → git reset --<mode> <hash>
```

Nessuna aggiunta a `Host2Wv`. La **modalità** del reset (soft/mixed) è raccolta lato host (come la
scelta tag del push in Fase 3), quindi il messaggio resta minimale.

## 4. Trigger (riuso del context menu della Fase 3)

Click destro su un nodo commit → il menu esistente guadagna un **gruppo separato** (sotto le
azioni-ref della Fase 3, con un divisore):
- **↩ Revert questo commit** → `onRevert(hash)`
- **⤷ Cherry-pick su HEAD** → `onCherryPick(hash)`
- **⟲ Reset HEAD a questo commit** → `onResetTo(hash)`

Il divisore separa le *mutazioni di cronologia* (Fase 4) dalle *azioni-ref* (Fase 3): piccola
aggiunta `separator?: boolean` a `MenuItem`.

## 5. Conferme e flusso (tutte guardate)

- **Revert**: conferma "Revert del commit `<short>` «`<subject>`»? Creerà un commit che annulla le
  sue modifiche." → `git revert --no-edit <hash>` (`--no-edit` evita l'editor che bloccherebbe
  l'host).
- **Cherry-pick**: conferma "Cherry-pick del commit `<short>` su «`<currentBranch>`»?" →
  `git cherry-pick <hash>`.
- **Reset**: il dialogo **[Soft — mantieni staged] [Mixed — mantieni unstaged] [Annulla]** *è* la
  conferma → `git reset --soft|--mixed <hash>`.
- **Successo**: notifica info + **hint reflog** ("stato precedente recuperabile da `git reflog`:
  HEAD@{1}") + `refresh()`.
- **Conflitto** (revert/cherry-pick): l'operazione si ferma in corso; l'host rileva il sequencer e
  mostra un warning con pulsante **[Annulla operazione]** → `git revert|cherry-pick --abort` +
  `refresh()`. Se l'utente **non** annulla, il working tree resta in conflitto da risolvere
  nell'IDE (i file `U` compaiono nella pseudo-riga); `refresh()` mostra lo stato.
- **Errore semplice** (es. revert di un merge senza mainline, cherry-pick vuoto): warning col
  messaggio git, nessuno stato in corso → nessun pulsante annulla.

## 6. Host — handler

`GitService` (entrambi gli host) guadagna:
- `revert(hash)` → `git revert --no-edit <hash>`
- `cherryPick(hash)` → `git cherry-pick <hash>`
- `resetTo(hash, mode)` → `git reset --soft <hash>` oppure `git reset --mixed <hash>`
- `revertAbort()` → `git revert --abort` · `cherryPickAbort()` → `git cherry-pick --abort`
- `sequencerState()` → `"revert" | "cherryPick" | null`, verificando l'esistenza di
  `REVERT_HEAD` / `CHERRY_PICK_HEAD` (via `git rev-parse --git-path <name>`).

Validazione hash `^[0-9a-f]{4,40}$` (come già fa `show()`) — pattern di sicurezza ref della Fase 3.

Handler nel provider/panel:
- **revert / cherryPick**: conferma nativa → esegue via `runGitAction`. Su fallimento, controlla
  `sequencerState()`: se in corso (conflitto) → warning + azione **Annulla operazione** (chiama il
  `--abort` corrispondente, poi `refresh()`); altrimenti → warning semplice.
- **resetTo**: dialogo nativo a 3 pulsanti (Soft/Mixed/Annulla) → `runGitAction` con la modalità
  scelta.
- **Hint undo**: dopo un successo, la notifica include il riferimento reflog (`HEAD@{1}`).

## 7. Motore — UI

- **`ui/ContextMenu.tsx`**: aggiunta `separator?: boolean` a `MenuItem` → renderizza un divisore
  (`.ctx-sep`) sopra la voce.
- **`ui/GitSwimlanes.tsx`**: tre nuove prop opzionali (`onRevert`, `onCherryPick`, `onResetTo`); in
  `openCommitMenu`, dopo le voci ref della Fase 3, aggiunge le tre voci mutazione (la prima con
  `separator: true`). Assenza delle callback → voci nascoste (retrocompatibile).
- **`webview.ts`**: mappa le callback ai post tipizzati.
- **`ui/WorkingTreeRow.tsx`**: `fileStatus` aggiunge il caso `U` → label "conflitto", colore rosso,
  così i file in conflitto (revert/cherry-pick interrotti) si leggono chiaramente nella pseudo-riga.
- **`engine.css`**: stile `.ctx-sep` (divisore del menu).

## 8. Determinismo / purezza del motore

Il motore non cambia nella logica di modello. Menu → callback; le mutazioni si riflettono solo
attraverso il `git log` / `git status` rifresati dall'host (nuovo commit di revert, HEAD spostato
dal reset, commit applicato dal cherry-pick, file `U` in caso di conflitto). Il cardine §1 regge.

## 9. Casi limite
| Caso | Comportamento |
|---|---|
| Revert/cherry-pick pulito | nuovo commit → refresh + hint undo |
| Revert/cherry-pick in conflitto | stato in corso; warning + Annulla operazione; o risolvi nell'IDE |
| Revert di un commit merge (senza mainline) | git fallisce, nessuno stato in corso → warning |
| Cherry-pick "vuoto" (già applicato) | git fallisce/empty → warning |
| Reset a un commit qualsiasi | branch corrente spostato, modifiche preservate (soft/mixed) |
| Reset in HEAD detached | git sposta HEAD; comportamento git standard (riflesso dal refresh) |
| Hash non valido | rifiutato dalla validazione → warning |
| File in conflitto (`U`) | badge "conflitto" rosso nella pseudo-riga working-tree |
| Cambio repo | `refresh()` riallinea tutto (Fasi 1-3) |

## 10. Testing
- **`ContextMenu`** (jsdom, TDD): una voce con `separator: true` rende il divisore `.ctx-sep`.
- **`GitSwimlanes`** (jsdom, TDD): il menu su un commit mostra Revert / Cherry-pick / Reset (sotto le
  voci ref, dopo un divisore); il click invoca `onRevert`/`onCherryPick`/`onResetTo` con l'hash.
- **`WorkingTreeRow`** (jsdom, TDD): un file con codice `U` mostra il badge "conflitto".
- **host**: `tsc --noEmit` / `compileKotlin`; verifica browser che i trigger postino i messaggi
  tipizzati corretti (conferme/abort/hint nativi verificati a mano).

## 11. File toccati (stima)
- `packages/contract/src/index.ts` — 3 messaggi `Wv2Host`.
- `packages/engine/src/ui/ContextMenu.tsx` — `separator?` + divisore.
- `packages/engine/src/ui/GitSwimlanes.tsx` — 3 prop/callback + voci menu mutazione.
- `packages/engine/src/ui/WorkingTreeRow.tsx` — caso `U` "conflitto".
- `packages/engine/src/webview.ts` — mappa callback → post.
- `packages/engine/src/engine.css` — `.ctx-sep`.
- `packages/vscode/src/GitService.ts` (revert/cherryPick/resetTo/abort/sequencerState),
  `SwimlanesViewProvider.ts` (handler con conferme/abort/hint).
- `intellij/.../GitService.kt` (stessi metodi), `SwimlanesPanel.kt` (handler con `Messages` +
  abort + hint), `Json.kt` (nessun campo nuovo: i messaggi usano solo `hash`, già presente).

## 12. Fuori scope (Fase 4)
Commit, stage/unstage (→ UI nativa dell'IDE); rebase interattivo; merge; `reset --hard`;
force-push; revert di commit merge con selezione mainline (errore mostrato); la **risoluzione** dei
conflitti (delegata all'IDE nativo). Con questa fase la roadmap "da sola-lettura a gestione GIT" è
completa.
