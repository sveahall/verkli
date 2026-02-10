/**
 * Simple circuit-breaker for external service calls (TTS, translation API, etc).
 *
 * States: CLOSED (normal) → OPEN (tripped) → HALF_OPEN (probe)
 * - Tracks consecutive failures.
 * - Opens after `threshold` failures, rejecting calls for `resetTimeoutMs`.
 * - After timeout, allows one probe call (HALF_OPEN).
 * - Probe success → CLOSED. Probe failure → OPEN again.
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening. Default: 5 */
  threshold?: number;
  /** Time in ms to stay open before allowing a probe. Default: 60_000 (1 min) */
  resetTimeoutMs?: number;
  /** Optional label for logging. */
  name?: string;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — call rejected`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;
  readonly label: string;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = opts.threshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 60_000;
    this.label = opts.name ?? "default";
  }

  getState(): CircuitState {
    if (this.state === "open" && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.state = "half_open";
    }
    return this.state;
  }

  /**
   * Execute an async function through the circuit breaker.
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.getState();

    if (current === "open") {
      throw new CircuitOpenError(this.label);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = "open";
      console.warn(
        `[circuit-breaker] "${this.label}" OPEN after ${this.failures} consecutive failures`
      );
    }
  }

  /** Reset to closed (for tests). */
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.lastFailureTime = 0;
  }
}
