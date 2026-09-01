export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 3000,  // Base 3.0s (attempt 1: ~2.1s - 3.9s)
  backoffFactor: 2.5,    // Base 7.5s (attempt 2: ~5.2s - 9.7s) -> Base 18.75s (attempt 3: ~13.1s - 24.3s)
  maxDelayMs: 25000,     // Ceiling 25s
  jitterFactor: 0.3      // +/- 30% randomization to prevent thundering herds
};

/**
 * Determines whether an HTTP status code represents a transient, retriable error.
 */
export function isTransientHttpError(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Determines whether an error message or exception represents a transient network/capacity failure.
 */
export function isTransientError(err: any): boolean {
  if (!err) return false;
  const message = (err.message || String(err)).toLowerCase();
  return (
    message.includes('503') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('504') ||
    message.includes('unavailable') ||
    message.includes('high demand') ||
    message.includes('rate limit') ||
    message.includes('resource exhausted') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed') ||
    message.includes('socket disconnected') ||
    message.includes('network')
  );
}

/**
 * Calculates exponential backoff with jitter for a given retry attempt.
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  randomFn: () => number = Math.random
): number {
  const exponent = Math.max(0, attempt - 1);
  const rawDelay = config.initialDelayMs * Math.pow(config.backoffFactor, exponent);
  const cappedDelay = Math.min(rawDelay, config.maxDelayMs);
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitterOffset = (randomFn() * 2 - 1) * jitterRange;
  return Math.round(Math.max(100, cappedDelay + jitterOffset));
}
