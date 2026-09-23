/**
 * Snapshot how many bytes each user stores.
 *
 *   npm run usage:storage
 *
 * Also runs nightly inside the worker runtime; the logic lives in
 * src/lib/usage/tasks.ts so both callers share it.
 */
import "./load-dotenv";
import { snapshotStorage } from "../src/lib/usage/tasks";

snapshotStorage((line) => console.info(line))
  .then(({ totalBytes, orphanedBytes }) => {
    console.info(
      `[usage:storage] total ${(totalBytes / 1e6).toFixed(1)} MB` +
        (orphanedBytes
          ? `, of which ${(orphanedBytes / 1e6).toFixed(1)} MB belongs to deleted accounts`
          : "")
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
