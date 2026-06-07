import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "packages/engine/dist");
const assets = ["engine.js", "engine.css"];
const targets = [
  join(root, "packages/vscode/media"),
  join(root, "intellij/src/main/resources/web"),
];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

for (const asset of assets) {
  const src = join(distDir, asset);
  if (!(await exists(src))) {
    console.error(`✗ Missing ${src}. Run "npm run build" for the engine first.`);
    process.exit(1);
  }
}

for (const dir of targets) {
  await mkdir(dir, { recursive: true });
  for (const asset of assets) {
    await copyFile(join(distDir, asset), join(dir, asset));
    console.log(`✓ ${asset} → ${dir.replace(root + "/", "")}`);
  }
}
console.log("Engine bundle synced to both hosts.");
