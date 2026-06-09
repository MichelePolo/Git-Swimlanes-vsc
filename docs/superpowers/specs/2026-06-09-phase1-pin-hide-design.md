# Fase 1 — Pin & Hide dei branch (design)

> Stato: approvato. Primo ciclo della roadmap "da sola-lettura a gestione GIT"
> (`docs/superpowers/specs/2026-06-09-git-management-roadmap.md`). **Zero mutazioni git**:
> sono feature di *vista*. Decisioni dal brainstorming (incluso companion visivo):
> pannello "Branches" dedicato · pin front-order · corsia `hidden` unica e distinta da
> `(no branch ref)` · config IDE-local per-repo · MVP senza drag-reorder.

## 1. Obiettivo

Dare allo sviluppatore il controllo sulla disposizione delle corsie:
- **Pin** — fissare branch nelle corsie più a sinistra, nell'ordine scelto, così restano
  sempre nella stessa posizione relativa.
- **Hide** — nascondere branch: i loro commit collassano in un'unica corsia grigia `hidden`,
  togliendo rumore dal grafo.

La configurazione è **persistente per-repo, locale all'IDE** (non condivisa, non nel repo).

## 2. Modello dati

Nuovo tipo condiviso (in `packages/contract`):

```ts
export interface ViewConfig {
  pinned: string[]; // nomi-branch normalizzati, nell'ordine di pin (sinistra→destra)
  hidden: string[]; // nomi-branch normalizzati da nascondere
}
```

`LaneModel` guadagna un campo (in `packages/contract`): `allBranches: string[]` — l'universo
dei nomi-branch (tip dedotti dal log `--all`, deduplicati remote/locale), indipendente da
pin/hide. Serve al pannello per elencare *tutti* i branch con il loro stato.

## 3. Algoritmo: `assignLanes` config-driven

Firma: `assignLanes(commits, byHash, config: ViewConfig = { pinned: [], hidden: [] }): LaneModel`.
Con la config di default il comportamento è **identico** ad oggi (retrocompatibilità: i 6 test
esistenti restano verdi).

Passi (modifica dei passi 2-4 attuali):

1. **Tip** — invariato: raccogli i tip dei branch, dedup remote/locale per nome base.
2. **Partizione** — dividi i tip in *visibili* (nome ∉ `hidden`) e *nascosti* (nome ∈ `hidden`).
3. **Ordina i visibili** con chiave:
   - se il nome ∈ `pinned` → `[0, indexInPinned]`
   - altrimenti → `[1, ...priority(name)]` (la `priority` attuale: main=0, develop=1, alfabetico)
   Assegna le corsie `0..k-1`.
4. **Claim visibili** — first-parent walk in quest'ordine → `laneOf` / `branchOf` (invariato).
5. **Claim nascosti** — per ogni branch nascosto, first-parent walk dei commit *non ancora
   reclamati* → tutti nella **stessa** corsia `hidden` (indice `k`), `branchOf = "hidden"`.
   La corsia `hidden` esiste solo se almeno un commit ci finisce.
6. **Fallback** — i commit ancora non reclamati → corsia `(no branch ref)` (indice successivo).
   Esiste solo se ci sono orfani reali.
7. **`laneNames`** = `[…visibili ordinati, "hidden"?, "(no branch ref)"?]` (in quest'ordine).
8. `allBranches` = nomi di *tutti* i tip (visibili + nascosti), ordinati come al punto 3 ma
   includendo i nascosti in coda alfabetica.

**Regola di priorità (confermata):** un commit reclamato da un branch visibile (via first-parent)
resta nella corsia visibile; finisce in `hidden` solo se il suo unico claim è un branch nascosto.
Lo garantisce l'ordine di claim (visibili prima dei nascosti).

**Conflitto pin+hide:** se un nome è in entrambi gli array, *hide vince* — è nei nascosti, quindi
escluso dai visibili e il suo indice di pin è ignorato.

## 4. Pannello "Branches" (componente del motore)

Nuovo componente React `ui/BranchPanel.tsx`, reso dal motore → **identico sui due host**.
- Aperto/chiuso da un pulsante in `.sw-toolbar` (accanto a repo-selector e "⤓ Pull request").
- Elenca `model.allBranches` ∪ i nomi in `config` (per i branch *assenti* dal log corrente).
- Per riga: pallino/nome colorato (`color(name)`), toggle **📌 pin**, toggle **🙈 hide**.
  Un branch assente dal log è marcato (grigio + "assente").
- Stato derivato da `config`: `pinned.includes(name)`, `hidden.includes(name)`.
- Interazioni → callback `onTogglePin(name)` / `onToggleHide(name)` che producono un nuovo
  `ViewConfig` e lo emettono via `onViewConfigChange(next)`.
  - toggle pin: aggiunge/rimuove `name` da `pinned` (append in coda quando aggiunto).
  - toggle hide: aggiunge/rimuove da `hidden`. (pin+hide ammessi nella config; l'algoritmo fa
    vincere hide.)

`GitSwimlanes` riceve `viewConfig?: ViewConfig` e `onViewConfigChange?(c: ViewConfig)`, costruisce
il modello con `assignLanes(..., viewConfig)` (memoizzato su `[log/commits, viewConfig]`), e rende
`BranchPanel` nella toolbar.

## 5. Protocollo messaggi + persistenza

Due nuovi messaggi (in `packages/contract`):

```ts
// Host → Webview
| { type: "viewConfig"; config: ViewConfig }
// Webview → Host
| { type: "setViewConfig"; config: ViewConfig }
```

- **webviewController**: gestisce `viewConfig` → lo mette in `ViewState.viewConfig`, **preservandolo
  attraverso `setLog`/`init`/`theme`/`repos`** (come già fatto per `repos`). `webview.ts` passa
  `viewConfig` a `GitSwimlanes` e cabla `onViewConfigChange` → `host.post({ type:"setViewConfig", config })`.
- **VS Code host**: persiste in `ctx.workspaceState`, chiave `gitSwimlanes.viewConfig::<repoRoot>`.
  - su `ready`/`refresh`/`selectRepo`: legge la config del repo corrente → `post({type:"viewConfig", config})`.
  - su `setViewConfig`: salva + ri-`post` `viewConfig` (così la vista si aggiorna).
- **IntelliJ host**: un servizio `@State` `PersistentStateComponent` a livello di progetto, mappa
  `repoRootPath → ViewConfig`. Stessi due momenti (carica su refresh/selectRepo, salva su
  `setViewConfig`). `WvMessage` (Json.kt) aggiunge il campo `config` (decodificato con Gson nello
  stesso modo degli altri).

Nota: il re-render avviene perché un nuovo `viewConfig` ri-passa per `assignLanes`. Non serve un
`setLog`: l'host rimanda solo `viewConfig`.

## 6. Casi limite (regole esplicite)

| Caso | Comportamento |
|---|---|
| Branch pinnato **e** nascosto | hide vince: escluso dalle corsie, pin ignorato |
| Branch in config ma assente dal log | nessun effetto ora; si applica quando comparirà; nel pannello marcato "assente" |
| Tutti i branch di una corsia nascosti | i loro commit (via first-parent) → corsia `hidden` |
| Nessun pin, nessun hide | identico a oggi (corsia `hidden` non compare) |
| Cambio repo | si carica/applica la `ViewConfig` di quel repo |
| Nome remote vs locale | config su nome normalizzato (senza `origin/`), coerente col dedup esistente |

## 7. Testing

- **`assignLanes`** (estende `test/assignLanes.test.ts`, Node):
  - pin singolo → corsia 0; pin multiplo → ordine = ordine in `pinned`.
  - non-pinnati seguono il default dopo i pinnati.
  - hide → i commit del branch finiscono nella corsia `hidden`; `laneNames` contiene `hidden`.
  - `hidden` e `(no branch ref)` coesistono come corsie **distinte**.
  - conflitto pin+hide → hide vince.
  - branch assente in config → nessun effetto.
  - config di default → output identico (regressione).
  - `allBranches` elenca tutti i tip.
- **`BranchPanel`** (jsdom + Testing Library): elenca i branch con stato pin/hide; i toggle
  invocano `onViewConfigChange` con il config aggiornato corretto; branch assente marcato.
- **webviewController** (`test/webviewController.test.ts`): `viewConfig` aggiorna lo stato ed è
  **preservato** attraverso un `setLog`.
- **Host**: `tsc`/`compileKotlin` verdi; verifica nel browser del flusso completo (pin/hide →
  corsie si riordinano / collassano → reload → la config persiste via getState-equivalente).

## 8. File toccati (stima)

- `packages/contract/src/index.ts` — `ViewConfig`, `allBranches` in `LaneModel`, 2 messaggi.
- `packages/engine/src/model/assignLanes.ts` — config-driven + `allBranches`.
- `packages/engine/src/ui/BranchPanel.tsx` — nuovo.
- `packages/engine/src/ui/GitSwimlanes.tsx` — prop `viewConfig`/`onViewConfigChange`, render pannello.
- `packages/engine/src/webviewController.ts`, `webview.ts` — routing `viewConfig`/`setViewConfig`.
- `packages/engine/src/engine.css` — stile pannello.
- `packages/vscode/src/SwimlanesViewProvider.ts` — persistenza `workspaceState` + handler.
- `intellij/.../ViewConfigStore.kt` (nuovo `PersistentStateComponent`), `SwimlanesPanel.kt`,
  `Json.kt` (campo `config`).

## 9. Fuori scope (Fase 1)

Drag-reorder dei pin · pin/hide per *pattern* (glob) · condivisione della config nel repo ·
qualunque azione che muti git. Restano per fasi/ciclo successivi.
