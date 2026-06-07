# Git Swimlanes — Design del workspace (scaffolding monorepo)

> Stato: approvato (design). Scope: **solo scaffolding/scheletro**. Nessuna logica del
> motore o degli host viene implementata in questo ciclo: solo struttura, configurazioni
> di build, contratti condivisi e file segnaposto con firme/`TODO`.

## 1. Obiettivo

Preparare un workspace unico che ospiti i tre progetti delle specifiche esistenti, in modo
che lo sviluppo possa partire e che i tre condividano un solo motore e un solo contratto di
messaggi ("mutuare le esperienze"). I tre progetti, riletti dalle spec, sono:

| Progetto | Spec | Natura |
|---|---|---|
| **Motore** (web-agnostico) | `git-swimlanes-spec.md` | Componente React/TS + funzioni pure. È il visualizzatore. |
| **Plugin VS Code** | `git-swimlanes-vscode-spec.md` | Guscio host: webview + `bridge.js` (`acquireVsCodeApi`). |
| **Plugin IntelliJ** | `git-swimlanes-intellij-spec.md` | Guscio host: JCEF + `JBCefJSQuery`. |

Principio chiave delle spec: il motore è platform-agnostic e gira **invariato** dentro la
webview di entrambi gli host; cambia solo il file ponte. Il workspace materializza questa
separazione.

## 2. Strumentazione e identità

- **Monorepo**: npm workspaces (npm 9 già presente, zero installazioni). I pacchetti JS
  stanno in `packages/*`; il plugin IntelliJ vive nello stesso repo come modulo Gradle a sé,
  **fuori** dai workspaces npm (è JVM, non consuma npm).
- **Bundler motore**: `tsup` (wrapper esbuild) con doppio output (vedi §5).
- **Test**: `vitest` in `engine` e `contract`.
- **TypeScript**: `strict`, base condivisa in `tsconfig.base.json`.
- **Naming**:
  - npm scope: `@michelepolo/git-swimlanes-{contract,engine,vscode}`
  - IntelliJ: plugin id `io.github.michelepolo.gitswimlanes`, package Kotlin
    `io.github.michelepolo.gitswimlanes`, Gradle group `io.github.michelepolo`.

## 3. Struttura ad albero

```
Git-Swimlanes-vsc/                      ← root = monorepo npm workspaces
├── package.json                        # workspaces:["packages/*"]; script build/sync/dev/test
├── tsconfig.base.json                  # TS strict, esteso da ogni pacchetto
├── .gitignore  ·  README.md
├── docs/
│   ├── git-swimlanes-spec.md           # i 3 .md spostati qui dalla root
│   ├── git-swimlanes-vscode-spec.md
│   ├── git-swimlanes-intellij-spec.md
│   └── superpowers/specs/2026-06-08-workspace-scaffolding-design.md
├── packages/
│   ├── contract/    @michelepolo/git-swimlanes-contract
│   │   ├── package.json · tsconfig.json
│   │   └── src/index.ts                # Wv2Host, Host2Wv, CommitNode, Theme, DiffRequest, …
│   ├── engine/      @michelepolo/git-swimlanes-engine   ← progetto "web-agnostico"
│   │   ├── package.json · tsconfig.json · tsup.config.ts · vitest.config.ts
│   │   ├── src/index.ts                # entry libreria: <GitSwimlanes/> + funzioni pure
│   │   ├── src/webview.ts              # entry IIFE: monta + installa window.GitSwimlanes/__host
│   │   ├── src/model/{parseLog,assignLanes,detectPR,color,layout}.ts   (firme + TODO)
│   │   ├── src/ui/GitSwimlanes.tsx     (stub)
│   │   └── test/{parseLog,assignLanes,detectPR}.test.ts   (segnaposto vitest)
│   └── vscode/      @michelepolo/git-swimlanes-vscode
│       ├── package.json                # manifest estensione (contributes…)
│       ├── tsconfig.json · tsup.config.ts (bundle CJS dell'estensione)
│       ├── src/{extension,SwimlanesViewProvider,GitService,html}.ts   (scheletri)
│       └── media/ bridge.js  ·  .gitkeep   (engine.js/.css atterrano qui via sync)
├── intellij/                           ← modulo Gradle/Kotlin (NON workspace npm)
│   ├── build.gradle.kts · settings.gradle.kts · gradle.properties
│   ├── gradle/wrapper/gradle-wrapper.properties
│   └── src/main/
│       ├── kotlin/io/github/michelepolo/gitswimlanes/
│       │   ├── SwimlanesToolWindowFactory.kt · SwimlanesPanel.kt
│       │   ├── GitService.kt · Json.kt                      (scheletri)
│       └── resources/
│           ├── META-INF/plugin.xml
│           └── web/ index.html  ·  .gitkeep   (engine.js/.css atterrano qui via sync)
└── scripts/sync-engine.mjs             # engine/dist → vscode/media + intellij/…/web
```

## 4. Grafo delle dipendenze

```
contract  ←  engine  ←  vscode        (npm workspaces, symlink locali)
                 │
                 └── (artefatto buildato)  →  vscode/media/  +  intellij/.../web/   via sync
```

- `engine` e `vscode` importano i tipi da `@michelepolo/git-swimlanes-contract`.
- `intellij` **non** dipende da npm: `Json.kt` ridichiara le forme dei messaggi in Kotlin,
  con un commento che indica `packages/contract/src/index.ts` come fonte canonica.

## 5. Il motore ha due facce (riuso)

`tsup` produce, dallo stesso sorgente:

1. **Libreria** — `dist/index.js` (ESM) + `dist/index.d.ts`. Esporta `<GitSwimlanes/>` e le
   funzioni pure (`parseLog`, `assignLanes`, `detectPR`, `colorFor`, …). È il consumo
   "web-agnostico" come componente React (spec motore §6).
2. **Bundle webview** — `dist/engine.js` (IIFE) + `dist/engine.css`. Si auto-monta su
   `#app` ed espone `window.GitSwimlanes.receive(...)` e legge `window.__host.post(...)`.
   Caricabile come `<script nonce>` semplice sotto CSP stretta. È ciò che gli host
   incorporano, invariato.

## 6. Flusso di build

```
npm run build   # builda contract → engine (entrambi gli output) → estensione vscode
npm run sync    # node scripts/sync-engine.mjs: copia engine.js/.css nei due host
npm test        # vitest su engine + contract
# IntelliJ (richiede JDK 17):
cd intellij && ./gradlew buildPlugin
```

Lo `sync` è il giunto del riuso: un solo motore buildato, due destinazioni host.

## 7. Limiti dichiarati di questo scaffolding

1. **Toolchain JVM assente sulla macchina** (no JDK/Gradle). Vengono scaffoldati tutti i file
   Gradle/Kotlin/`plugin.xml`, ma **non** compilati, e il `gradle-wrapper.jar` (binario) non
   viene generato. Bootstrap documentato: installare **JDK 17** (Eclipse Temurin), poi
   `gradle wrapper` genera `gradlew`/wrapper jar; da lì `./gradlew buildPlugin`. I pacchetti
   JS sono invece verificati (build + test green).
2. **Logica non implementata**: ogni sorgente contiene firme, tipi e commenti
   `// TODO (spec §x.y)`, non l'algoritmo. È lo scope concordato.
3. **Sincronia contratto TS↔Kotlin manuale**: per lo scaffold `Json.kt` replica a mano le
   forme dei messaggi. Una generazione automatica è fuori scope ora (eventuale lavoro futuro).

## 8. Criteri di completamento

- `npm install` alla root collega i tre pacchetti JS senza errori.
- `npm run build` produce `engine/dist/{index.js,index.d.ts,engine.js,engine.css}` e il
  bundle dell'estensione VS Code.
- `npm run sync` popola `vscode/media/` e `intellij/.../web/` con il bundle del motore.
- `npm test` esegue i test segnaposto (verdi o `todo`).
- L'albero `intellij/` contiene tutti i file di configurazione e gli scheletri Kotlin; è
  documentato il singolo comando di bootstrap del wrapper Gradle.
- I tre `.md` di specifica sono spostati sotto `docs/` e i riferimenti incrociati restano validi.
```
