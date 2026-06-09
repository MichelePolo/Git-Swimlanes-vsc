# Git Swimlanes — Roadmap: da sola-lettura a gestione GIT

> Stato: approvato (roadmap di decomposizione). Questo documento **non** è uno spec di
> feature: è la decomposizione in fasi della visione "da visualizzatore di sola lettura a
> plugin di gestione GIT". Ogni fase avrà il suo ciclo separato brainstorm → spec → plan →
> dev. La Fase 1 è il prossimo ciclo.

## 1. Punto di partenza

Oggi Git Swimlanes è un **visualizzatore di sola lettura**. I comandi git effettivamente
eseguiti sono cinque, tutti di lettura/fetch:

| Comando | Scopo |
|---|---|
| `git log --all --date-order --name-status --pretty=…` | cronologia → grafo a corsie |
| `git show -M <hash> -- [oldPath] <path>` | diff di un file in un commit |
| `git remote` · `git remote get-url <remote>` | rilevamento forge (lettura) |
| `git fetch <remote> <refspec>` | ref PR/MR (unica scrittura: solo ref remote-tracking) |

Non tocca mai working tree, index, branch locali o commit. Architettura: un **motore**
platform-agnostic (TS/React) incapsulato in due host (VS Code, IntelliJ/JCEF) che comunicano
con un protocollo di messaggi condiviso (`packages/contract`). Pattern provato 5+ volte
(`openFile`, `fetchPullRefs`, `selectRepo`, `commitSelected`, `setLog`): **un nuovo messaggio
nel contratto + un handler nei due host** rende ogni feature quasi gratuita su entrambi gli IDE.

## 2. Decisioni bloccate (dal brainstorming)

- **Persistenza config di vista**: **IDE-local per-repo** (VS Code `workspaceState`, IntelliJ
  `PersistentStateComponent`). Privata, per-macchina, nessun impatto sul repo. Riusa il pattern
  `getState/setState` già in uso per gli accordion.
- **Semantica pin**: **ordine in testa (front-order)** — i branch pinnati occupano le corsie
  più a sinistra, nell'ordine in cui sono pinnati; i non-pinnati seguono l'ordine default.
  Robusto rispetto all'insieme dei branch presenti (niente indici assoluti fragili).
- **Semantica hide**: i branch marcati hidden **non reclamano corsia**; i loro commit cadono in
  un'ultima corsia grigia con etichetta **"hidden"** (riuso del meccanismo della corsia
  fallback `(no branch ref)`). *Regola di priorità*: un commit raggiunto solo da branch hidden
  → corsia hidden; se raggiunto anche da un branch visibile, resta nella corsia visibile (lo
  decide il claim first-parent già esistente).
- **Stato finale ambito**: **comuni + mutazioni guardate**. Ci si ferma PRIMA di rebase
  interattivo e UI di risoluzione conflitti (l'IDE li offre già nativamente).
- **Strategia di fasatura**: **rischio crescente** — ogni fase sale la scala del rischio e
  introduce l'infrastruttura *quando serve* (just-in-time).

## 3. Principi architetturali (cross-cutting)

- Il **motore resta la fonte unica della logica di vista**; gli host eseguono git e mostrano
  UI native. Nuove capacità = nuovi messaggi nel contratto + handler nei due host.
- **`assignLanes` diventa config-driven.** Oggi `priority(name)` è hardcoded
  (main→develop→alfabetico). Diventa: applica i pin (front-order) → poi il default; i branch
  hidden non reclamano corsia. È l'unico punto del motore che cambia per la Fase 1.
- **Determinismo preservato**: dato `(log + config)` l'output (corsie, colori, posizioni) resta
  identico e indipendente dall'ordine di scoperta. La config è solo un input in più; il
  principio cardine §1 della spec del motore non si rompe.
- **View-config**: forma `{ pinned: string[], hidden: string[], … }`, estendibile. L'host la
  legge all'avvio, la passa al motore col log, e la salva quando l'utente la cambia.

## 4. Le fasi

### Fase 1 — Feature UX di vista *(prossimo ciclo)*
Tre cose coese che condividono l'infra config e un pannello branch. **Zero mutazioni git.**
- **Pin (front-order)**: branch pinnati nelle corsie più a sinistra, nell'ordine di pin.
- **Hide**: branch hidden → corsia "hidden" (vedi regola di priorità §2).
- **Pannello branch** con toggle pin/hide. Trigger previsto: menu contestuale sull'etichetta di
  corsia + un pannello. Eventuali vicini (filtro/ricerca branch) solo se il pannello li rende
  ovvi (YAGNI).
- **Infra introdotta**: view-config store (host) + `assignLanes` config-driven + messaggi
  `setViewConfig` (webview→host, per salvare) e `viewConfig` (host→webview, per idratare).

### Fase 2 — Estensioni read-only + infrastruttura azioni
- **Feature**: blame di un file, `status`/diff del working tree, fetch/pull generale.
- **Infra introdotta**: **action-dispatch** — un messaggio generico `runAction{kind, args}`
  (webview→host) → l'host esegue il comando git → posta risultato/errore → refresh. Inaugurato
  con un'azione *sicura* (fetch/pull) per collaudare il pattern a rischio zero.

### Fase 3 — Operazioni non distruttive
- Crea branch/tag da un commit, checkout/switch, push (+ `-u`, `--tags`).
- Serve: gestione "working tree sporco" (avviso prima del checkout), conferme leggere.
- Monta sull'action-dispatch della Fase 2.

### Fase 4 — Mutazioni guardate
- Revert, cherry-pick, commit, reset di un singolo commit.
- Serve: **UX di conferma esplicita**, surfacing di errori/conflitti (la *risoluzione* dei
  conflitti è delegata all'IDE nativo), idealmente un hint di undo via reflog.

## 5. Infrastruttura cross-cutting (le 3 fondamenta, just-in-time)

1. **View-config store** (Fase 1) — IDE-local per-repo, `{pinned, hidden, …}`.
2. **Action-dispatch** (Fase 2) — messaggio generico → esecuzione git lato host →
   conferma/errore → refresh. Tutte le azioni delle Fasi 3-4 ci montano sopra.
3. **UX conferma/errore/undo** (Fase 4) — per le mutazioni di cronologia.

## 6. Sequenza, dipendenze, fuori-scope

- **Sequenza**: Fase 1 → Fase 2 → Fase 3 → Fase 4.
- **Dipendenze**: Fasi 3 e 4 dipendono dall'action-dispatch introdotto in Fase 2. La Fase 1 è
  indipendente (solo view-config).
- **Fuori scope esplicito** (delegato all'IDE nativo o a un ciclo futuro separato):
  - rebase interattivo, UI di risoluzione conflitti;
  - `reset --hard`, force-push, amend distruttivo;
  - integrazione forge via API REST (creare/mergiare/review PR, auth/token).

## 7. Funzionalità git — mappa di stato (riferimento)

Legenda: 👁️ il grafo *mostra* il risultato · ⚙️ il plugin *esegue* l'azione.

| Area | Azione | 👁️ | ⚙️ oggi | Fase |
|---|---|:--:|:--:|:--:|
| Lettura | cronologia, diff commit, lista branch/tag/remote | ✅ | ✅ | — (DONE) |
| Lettura | blame, status, diff working-tree | 🔲 | 🔲 | 2 |
| Vista | pin / hide corsie | — | 🔲 | **1** |
| Sync | fetch ref PR | ✅ | ✅ | — (DONE) |
| Sync | fetch/pull generale | — | 🔲 | 2 |
| Sync | push (+ -u, --tags) | — | 🔲 | 3 |
| Ref | crea/elimina branch·tag, checkout/switch | ✅ | 🔲 | 3 |
| Cronologia | commit, revert, cherry-pick, reset (1 commit) | ✅ | 🔲 | 4 |
| Cronologia | rebase -i, merge+conflitti, reset --hard, force-push | ✅ | 🔲 | fuori scope |
| Forge | rileva PR, PR come corsie | ✅ | ✅ | — (DONE) |
| Forge | crea/mergia/review PR via API | — | 🔲 | fuori scope |

## 8. Prossimo passo

Avviare il ciclo della **Fase 1**: brainstorm dedicato (semantiche fini di pin/hide, UI del
pannello, forma esatta dei messaggi `setViewConfig`/`viewConfig`, modifiche a `assignLanes`) →
spec → plan → sviluppo. Le altre fasi seguono in sequenza, ciascuna col proprio ciclo.
