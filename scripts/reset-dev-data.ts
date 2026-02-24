import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

const projectRoot = process.cwd();
const dataDir = resolve(projectRoot, "assets", "data");
const configPath = resolve(dataDir, "config.json");
const catalogPath = resolve(dataDir, "models-catalog.json");

await mkdir(dataDir, { recursive: true });
await writeFile(configPath, "{}\n", "utf8");
await writeFile(catalogPath, "[]\n", "utf8");

console.log("[DEV DATA] Reset assets/data/config.json and assets/data/models-catalog.json");
