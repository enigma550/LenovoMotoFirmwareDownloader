import { cp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { resolve } from "path";

const sourceDir = resolve(process.cwd(), "web", "dist", "web");
const targetDir = resolve(process.cwd(), "runtime", "views", "mainview");
const targetIndexPath = resolve(targetDir, "browser", "index.html");

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

const rawIndexHtml = await readFile(targetIndexPath, "utf8");
const patchedIndexHtml = rawIndexHtml
  .replace(/\s+type="module"/g, "")
  .replace(
    /<link rel="stylesheet" href="([^"]+)" media="print" onload="this.media='all'">/g,
    '<link rel="stylesheet" href="$1">',
  )
  .replace(/<noscript><link rel="stylesheet" href="([^"]+)"><\/noscript>/g, "");

if (patchedIndexHtml !== rawIndexHtml) {
  await writeFile(targetIndexPath, patchedIndexHtml, "utf8");
}

console.log(`[ELECTROBUN] Copied ${sourceDir} -> ${targetDir}`);
