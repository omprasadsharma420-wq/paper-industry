import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const distDir = resolve(root, "dist");
const serverEntry = resolve(distDir, "server", "index.js");
const hostingConfig = resolve(root, ".openai");
const distHostingConfig = resolve(distDir, ".openai");

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

const command = process.env.npm_execpath ? process.execPath : "vinext";
const args = process.env.npm_execpath
  ? [process.env.npm_execpath, "exec", "vinext", "build"]
  : ["build"];

const result = spawnSync(command, args, {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0 && !existsSync(serverEntry)) {
  process.exit(result.status ?? 1);
}

if (!existsSync(serverEntry)) {
  throw new Error("Expected vinext server entrypoint 'dist/server/index.js' to exist.");
}

if (!existsSync(hostingConfig)) {
  throw new Error("Expected '.openai/hosting.json' to exist.");
}

cpSync(hostingConfig, distHostingConfig, { recursive: true });
