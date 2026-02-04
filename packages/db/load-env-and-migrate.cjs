#!/usr/bin/env node
const path = require("path");
const { config } = require("dotenv");
const { spawnSync } = require("child_process");

const rootEnv = path.resolve(__dirname, "../../.env");
config({ path: rootEnv });

spawnSync("npx", ["prisma", "migrate", "dev"], {
  stdio: "inherit",
  env: process.env,
});
