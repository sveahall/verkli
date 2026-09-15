/**
 * Load missing settings from apps/web/.env.local before any env validation.
 * Explicit deployment and test-run settings must take precedence.
 * Import this first in Node scripts so process.env is set.
 */
import * as path from "path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(__dirname, "..", ".env.local");

if (existsSync(envLocalPath)) {
  const result = config({ path: envLocalPath, override: false });
  if (!result.error) {
    console.log(`[dotenv] loaded ${envLocalPath}`);
  } else {
    console.error(`[dotenv] failed to load ${envLocalPath}: ${result.error.message}`);
  }
}
