import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const outDir = resolve(root, "out");
const distDir = resolve(root, "dist");

if (!existsSync(outDir)) {
  throw new Error("Expected Next static export directory 'out' to exist.");
}

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

cpSync(outDir, distDir, { recursive: true });
