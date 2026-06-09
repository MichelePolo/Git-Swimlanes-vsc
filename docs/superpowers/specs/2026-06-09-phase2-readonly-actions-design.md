# Fase 2 — Estensioni read + convenzione azioni (design)

> Stato: approvato. Secondo ciclo della roadmap "da sola-lettura a gestione GIT"
> (`docs/superpowers/specs/2026-06-09-git-management-roadmap.md`). Ambito scelto:
> **convenzione azioni + `pull`/`fetch` generali + working-tree status** (pseudo-riga in cima).
> Rinviati a cicli successivi: blame, diff del working tree, stage/commit. Decisioni dal
> brainstorming (companion visivo): azioni come **messaggi tipizzati** (no dispatcher generico);
> status come **pseudo-riga in cima al grafo** con nodo tratteggiato su HEAD.

## 1. Obiettivo

Due cose, legate dal tema "cosa c'è oltre la cronologia":
1. **Azioni git sicure** — `pull` e `fetch` generali dalla toolbar, che inaugurano la
   *convenzione azione* su cui le Fasi 3-4 costruiranno le mutazioni.
2. **Working-tree status** — mostrare i file non committati (staged/unstaged/untracked) come
   una pseudo-riga in cima al grafo. **Sola lettura**: niente diff/stage/commit in questa fase.

## 2. Convenzione "azione" (l'infrastruttura leggera)

Non un dispatcher generico: ogni azione è un **messaggio `Wv2Host` tipizzato** (come
`fetchPullRefs` oggi). L'infra è una convenzione + un helper host condiviso:

- **Lato host**: un helper `runGitAction(label, block)` che esegue `block` (il comando git) su
  thread pool/async; su **successo** → `refresh()` + notifica informativa; su **errore** →
  notifica warning. VS Code e IntelliJ ne hanno uno ciascuno (riuso del pattern
  `fetchPullRefs` + notifiche già presente in entrambi).
- **Fasi 3-4**: ogni nuova azione = un messaggio tipizzato + un metodo `git.X()` + una riga che
  chiama `runGitAction`. Nessun nuovo meccanismo.

## 3. Azioni di Fase 2: `pull` e `fetch`

- **Contratto** (`Wv2Host`): `| { type: "pull" }` e `| { type: "fetch" }`.
- **Toolbar** (nel motore): pulsanti **⟳ Pull** e **⤓ Fetch**, accanto a "⤓ Pull request" e
  "⛋ Branches". Sempre visibili. Emettono il messaggio via un callback `onPull`/`onFetch`.
- **Host**: `GitService` guadagna `fetch()` (`git fetch --all --prune`) e `pull()`
  (`git pull --ff` sul branch corrente). Gli handler usano `runGitAction`:
  - successo → `refresh()` (riprende log+status aggiornati) + notifica "Pull/Fetch completato";
  - errore (no upstream, rete, conflitti) → notifica warning. La *risoluzione conflitti* di un
    pull resta all'IDE nativo (fuori scope).

## 4. Working-tree status

### 4.1 Dato e parsing (pattern `parseLog`)
- L'host esegue `git status --porcelain=v1 -z` (NUL-separato, robusto su path con spazi) dentro
  `refresh()` e invia il **testo grezzo** in un nuovo messaggio `Host2Wv`:
  `| { type: "status"; porcelain: string }`.
- Il motore lo parsa con una **funzione pura** `parseStatus(porcelain: string): WorkingTreeFile[]`
  (in `packages/engine/src/model/`), come `parseLog`. Niente parsing negli host (no duplicazione).
- Tipo condiviso (`packages/contract`):
  ```ts
  export interface WorkingTreeFile {
    path: string;
    index: string;    // codice X (staged): ' ' M A D R C U ?
    worktree: string; // codice Y (unstaged): ' ' M A D R C U ?
    old?: string;     // path precedente per rename/copy
  }
  ```
  Untracked = `?? path` → `{ index:'?', worktree:'?' }`. Un file può essere insieme staged e
  unstaged (es. `MM`).

### 4.2 Rendering: pseudo-riga in cima
- Se `WorkingTreeFile[]` è non vuoto, il motore renderizza una **pseudo-riga** sopra il commit
  più recente: testo "▾ Modifiche non committate (N)", con un **nodo tratteggiato** sulla corsia
  di HEAD (il commit con `head === true`; `laneX(laneOf[HEAD])`) collegato al nodo HEAD da un
  **arco tratteggiato**. Si espande (accordion) mostrando i file con badge A/M/D/R/?? e
  l'etichetta **staged**/**unstaged** (derivata da index/worktree).
- **Sola lettura**: nessun diff/stage/commit on-click in Fase 2.
- Working tree pulito (status vuoto) → nessuna pseudo-riga; comportamento identico ad oggi.

### 4.3 Approccio tecnico (la parte delicata: allineamento)
Per **non** riscrivere `computeOffsets` / la virtualizzazione, la pseudo-riga è una **banda
additiva in cima**, non una riga del modello degli offset:
- Un nuovo componente `ui/WorkingTreeRow.tsx` reso da `GitSwimlanes` **sopra** `.sw-body`,
  in una banda di altezza fissa (`rowH`, + `panelHeight` se espansa).
- Dentro la banda, un mini-SVG (largo `graphW`) disegna il nodo tratteggiato a
  `laneX(laneOf[HEAD])` e un breve arco tratteggiato verso il basso (verso il nodo HEAD, che è
  in cima alla sua corsia con l'ordinamento newest-first). L'allineamento col grafo è
  orizzontale (stessa `laneX`); il collegamento verticale è uno stub tratteggiato.
- Gli offset dei commit restano invariati (indici 0..n-1); la banda vive sopra. Isolamento
  massimo, zero impatto su virtualizzazione/diff/lane-header.

## 5. Error/result UX
- **Azioni**: notifiche host (info su successo, warning su errore), coerenti con `fetchPullRefs`.
- **Status**: se `git status` fallisce dentro `refresh()`, lo si ignora (il log resta valido) —
  niente `status` inviato → nessuna pseudo-riga. Non blocca la vista.

## 6. Casi limite
| Caso | Comportamento |
|---|---|
| Working tree pulito | nessuna pseudo-riga |
| Repo senza HEAD risolvibile (es. repo vuoto) | nessuna pseudo-riga (nessun nodo a cui agganciare) |
| `pull`/`fetch` senza upstream/remote | notifica warning; vista invariata |
| File rename in status (`R`) | mostrato `old → new`, come nei file dei commit |
| Untracked (`??`) | mostrato con badge "?" / "nuovo", etichetta untracked |
| Cambio repo | `refresh()` rimanda log + status del nuovo repo |

## 7. Testing
- **`parseStatus`** (Node, TDD): M/A/D/R/?? , staged vs unstaged, `MM` (entrambi), rename
  `old -> new`, NUL-separato, input vuoto → `[]`.
- **`WorkingTreeRow`** (jsdom): rende N file con badge+etichette corretti; espande/collassa;
  nodo tratteggiato presente; assente quando 0 file.
- **`GitSwimlanes`** (jsdom): la pseudo-riga compare con status non vuoto e sparisce con vuoto;
  i pulsanti Pull/Fetch invocano `onPull`/`onFetch`.
- **controller**: instrada `status` → stato; preservato attraverso refresh.
- **Host**: `tsc`/`compileKotlin`; verifica browser del flusso (modifica file → status appare;
  pull/fetch postano l'azione e l'host notifica/refresh).

## 8. File toccati (stima)
- `packages/contract/src/index.ts` — `WorkingTreeFile`, messaggi `pull`/`fetch`/`status`.
- `packages/engine/src/model/parseStatus.ts` — nuovo (puro).
- `packages/engine/src/ui/WorkingTreeRow.tsx` — nuovo.
- `packages/engine/src/ui/GitSwimlanes.tsx` — prop status + onPull/onFetch, render banda + toolbar.
- `packages/engine/src/webviewController.ts`, `webview.ts` — routing `status` + onPull/onFetch.
- `packages/engine/src/engine.css` — stile pseudo-riga.
- `packages/vscode/src/GitService.ts` (fetch/pull/status), `SwimlanesViewProvider.ts`
  (`runGitAction`, invia `status` in refresh, handler pull/fetch).
- `intellij/.../GitService.kt` (fetch/pull/status), `SwimlanesPanel.kt` (`runGitAction`, status
  in refresh, handler pull/fetch), `Json.kt` (nessun campo nuovo: pull/fetch sono senza args).

## 9. Fuori scope (Fase 2)
Diff del working tree, stage/unstage, commit, blame · risoluzione conflitti di un pull
(delegata all'IDE) · qualunque azione delle Fasi 3-4. Restano per i cicli successivi.
