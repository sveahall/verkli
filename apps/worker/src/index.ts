/**
 * Worker launcher boundary.
 *
 * This package intentionally avoids importing internal modules from apps/web.
 * TODO(phase4): extract import worker core into a shared package and run it directly here.
 */

import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const args = ["run", "-w", "@verkli/web", "import-worker"];

const child = spawn(command, args, {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error("[worker launcher] failed to start import worker", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[worker launcher] import worker exited due to signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

const shutdown = () => {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
