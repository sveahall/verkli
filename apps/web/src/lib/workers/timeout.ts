/**
 * Hard timeout wrapper for async worker operations.
 * Rejects with a descriptive error if the operation exceeds the deadline.
 */

export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(`${label ?? "Operation"} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps an async function with a hard timeout.
 * @param fn  - The async operation to run.
 * @param ms  - Maximum allowed time in milliseconds.
 * @param label - Optional label for the error message.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  label?: string
): Promise<T> {
  if (ms <= 0) return fn();

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new TimeoutError(ms, label));
      }
    }, ms);

    fn()
      .then((result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}
