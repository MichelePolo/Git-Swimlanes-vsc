# Git Swimlanes — pacchetti installabili

Artefatti pronti da installare **senza ricompilare** (utile sulle IDE del lavoro).
Scarica il file che ti serve da questa cartella e segui i passi.

## Cosa fa

Visualizzatore di cronologia Git deterministico a **corsie**, con gestione GIT integrata.
Stesso motore in VS Code e IntelliJ.

- **Vista:** grafo a corsie con etichette persistenti, diff dei commit, rilevamento PR/MR,
  multi-repo, tema chiaro/scuro. **Pin** e **hide** dei branch (corsia "hidden").
- **Lettura/sync:** Pull · Fetch · fetch dei ref PR; **stato del working tree** (file non
  committati, read-only) come riga in cima al grafo.
- **Azioni sui ref** (menu contestuale su commit/corsia + toolbar): crea/elimina branch e tag,
  checkout/switch, push (con `-u` / `--tags`).
- **Mutazioni guardate** (con conferma esplicita e gestione conflitti delegata all'IDE):
  revert, cherry-pick, reset (soft/mixed).

Il *commit* resta affidato all'UI nativa dell'IDE (staging, hunk, amend).

## VS Code — `git-swimlanes-vscode-0.0.0.vsix`
Richiede VS Code ≥ 1.85.

- **UI:** pannello *Extensions* → menu `⋯` in alto a destra → **Install from VSIX…** → scegli il `.vsix`.
- **Terminale:** `code --install-extension git-swimlanes-vscode-0.0.0.vsix`

## IntelliJ — `git-swimlanes-intellij-0.0.0.zip`
Compatibile con IntelliJ **2024.1 e successive** (incluse 2025.x / 2026.x). Vale per qualsiasi
IDE JetBrains che includa Git4Idea.

- *Settings/Impostazioni* → **Plugins** → ingranaggio ⚙ → **Install Plugin from Disk…** →
  seleziona lo **`.zip`** (non scompattarlo) → **Restart IDE**.

Poi apri il pannello **Git Swimlanes** dalla barra laterale.

## Note
- Alcune installazioni aziendali bloccano i plugin/estensioni di terze parti installati «da disco».
  Se l'opzione è disabilitata, è una restrizione IT.
- Per rigenerare gli artefatti: `npm run build` poi `cd packages/vscode && npm run package`
  (VS Code), e `cd intellij && ./gradlew buildPlugin` (IntelliJ).
