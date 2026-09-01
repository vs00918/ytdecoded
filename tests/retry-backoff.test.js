import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTransientHttpError,
  isTransientError,
  calculateBackoffDelay,
  DEFAULT_RETRY_CONFIG
} from '../src/pipeline/retry-policy.ts';

test('Retry Policy: HTTP Status Classification', () => {
  // Transient / retriable
  assert.equal(isTransientHttpError(429), true, '429 Rate Limit should be transient');
  assert.equal(isTransientHttpError(500), true, '500 Internal Error should be transient');
  assert.equal(isTransientHttpError(502), true, '502 Bad Gateway should be transient');
  assert.equal(isTransientHttpError(503), true, '503 Service Unavailable should be transient');
  assert.equal(isTransientHttpError(504), true, '504 Gateway Timeout should be transient');

  // Permanent / non-retriable
  assert.equal(isTransientHttpError(400), false, '400 Bad Request should not be retried');
  assert.equal(isTransientHttpError(401), false, '401 Unauthorized should not be retried');
  assert.equal(isTransientHttpError(403), false, '403 Forbidden should not be retried');
  assert.equal(isTransientHttpError(404), false, '404 Not Found should not be retried');
  assert.equal(isTransientHttpError(200), false, '200 OK is not an error');
});

test('Retry Policy: Exception & Error Message Classification', () => {
  assert.equal(isTransientError(new Error('This model is currently experiencing high demand.')), true);
  assert.equal(isTransientError(new Error('Gemini API error (503): Service Unavailable')), true);
  assert.equal(isTransientError(new Error('Resource exhausted: Rate limit exceeded')), true);
  assert.equal(isTransientError(new Error('fetch failed: connect ECONNRESET')), true);
  assert.equal(isTransientError(new Error('Client network socket disconnected before secure TLS connection')), true);

  // Permanent errors
  assert.equal(isTransientError(new Error('GEMINI_API_KEY environment variable is missing.')), false);
  assert.equal(isTransientError(new Error('Invalid API Key provided: [REDACTED_API_KEY]')), false);
  assert.equal(isTransientError(new Error('Model models/gemini-unknown not found')), false);
  assert.equal(isTransientError(null), false);
});

test('Retry Policy: Exponential Backoff Calculation with Jitter', () => {
  // Mock randomFn returning 0.5 (neutral jitter = exact base)
  const neutralRandom = () => 0.5;

  const delay1 = calculateBackoffDelay(1, DEFAULT_RETRY_CONFIG, neutralRandom);
  assert.equal(delay1, 3000, 'Attempt 1 base delay should be 3000ms');

  const delay2 = calculateBackoffDelay(2, DEFAULT_RETRY_CONFIG, neutralRandom);
  assert.equal(delay2, 7500, 'Attempt 2 base delay should be 7500ms (3000 * 2.5)');

  const delay3 = calculateBackoffDelay(3, DEFAULT_RETRY_CONFIG, neutralRandom);
  assert.equal(delay3, 18750, 'Attempt 3 base delay should be 18750ms (3000 * 2.5^2)');

  // Test with minimum jitter (randomFn = 0 -> -30%)
  const minRandom = () => 0.0;
  const minDelay1 = calculateBackoffDelay(1, DEFAULT_RETRY_CONFIG, minRandom);
  assert.equal(minDelay1, 2100, 'Attempt 1 min jitter should be 2100ms (3000 * 0.7)');

  // Test with maximum jitter (randomFn = 1 -> +30%)
  const maxRandom = () => 1.0;
  const maxDelay1 = calculateBackoffDelay(1, DEFAULT_RETRY_CONFIG, maxRandom);
  assert.equal(maxDelay1, 3900, 'Attempt 1 max jitter should be 3900ms (3000 * 1.3)');

  // Test ceiling cap
  const cappedDelay = calculateBackoffDelay(10, DEFAULT_RETRY_CONFIG, neutralRandom);
  assert.equal(cappedDelay, 25000, 'Delay should be capped at maxDelayMs (25000ms)');
});
