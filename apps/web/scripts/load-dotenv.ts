/**
 * Load .env / .env.local before any env validation.
 * Import this first in Node scripts (e.g. import-worker) so process.env is set.
 */
import * as path from "path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const repoRootFromScript = path.resolve(__dirname, "..", "..");
for (const root of [cwd, path.resolve(cwd, ".."), repoRootFromScript]) {
  const envPath = path.join(root, ".env");
  const envLocalPath = path.join(root, ".env.local");
  if (existsSync(envPath)) config({ path: envPath });
  if (existsSync(envLocalPath)) config({ path: envLocalPath, override: true });
}
