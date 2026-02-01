/**
 * Per-service resilience configuration for the gateway.
 *
 * Each downstream gRPC service can have tuned thresholds based on its
 * characteristics and criticality:
 * - balance: Stricter (handles money) - lower thresholds, faster circuit break
 * - game/player: Standard thresholds
 * - event/notify: Lenient (less critical) - higher thresholds
 */

import type { ServiceResilienceMap } from '@specify-poker/shared';
import { readIntEnv, readBoolEnv } from '@specify-poker/shared';

export type GatewayResilienceConfig = {
  /** Whether resilience is enabled (default: true) */
  enabled: boolean;
  /** Per-service configuration */
  services: ServiceResilienceMap;
};

/**
 * Loads resilience configuration from environment variables.
 */
export function loadResilienceConfig(env: NodeJS.ProcessEnv): GatewayResilienceConfig {
  const enabled = readBoolEnv(env, 'RESILIENCE_ENABLED', true);

  return {
    enabled,
    services: {
      // Balance service - critical (handles money)
      // Stricter thresholds, faster circuit break
      balance: {
        enabled,
        circuitBreaker: {
          failureThreshold: readIntEnv(env, 'BALANCE_CB_FAILURE_THRESHOLD', 3, { min: 1 }),
          openDurationMs: readIntEnv(env, 'BALANCE_CB_OPEN_DURATION_MS', 15000, { min: 1000 }),
          halfOpenSuccessThreshold: 2,
          windowSize: 10,
        },
        retry: {
          maxAttempts: readIntEnv(env, 'BALANCE_RETRY_MAX_ATTEMPTS', 2, { min: 1 }),
          baseDelayMs: 50,
          maxDelayMs: 2000,
        },
        bulkhead: {
          maxConcurrent: readIntEnv(env, 'BALANCE_BULKHEAD_MAX_CONCURRENT', 30, { min: 1 }),
          maxQueueSize: 50,
          queueTimeoutMs: 2000,
        },
        timeoutMs: readIntEnv(env, 'BALANCE_TIMEOUT_MS', 3000, { min: 100 }),
      },

      // Game service - important for gameplay
      game: {
        enabled,
        circuitBreaker: {
          failureThreshold: readIntEnv(env, 'GAME_CB_FAILURE_THRESHOLD', 5, { min: 1 }),
          openDurationMs: readIntEnv(env, 'GAME_CB_OPEN_DURATION_MS', 30000, { min: 1000 }),
          halfOpenSuccessThreshold: 2,
          windowSize: 10,
        },
        retry: {
          maxAttempts: readIntEnv(env, 'GAME_RETRY_MAX_ATTEMPTS', 3, { min: 1 }),
          baseDelayMs: 100,
          maxDelayMs: 5000,
        },
        bulkhead: {
          maxConcurrent: readIntEnv(env, 'GAME_BULKHEAD_MAX_CONCURRENT', 50, { min: 1 }),
          maxQueueSize: 100,
          queueTimeoutMs: 3000,
        },
        timeoutMs: readIntEnv(env, 'GAME_TIMEOUT_MS', 2000, { min: 100 }),
      },

      // Player service - standard importance
      player: {
        enabled,
        circuitBreaker: {
          failureThreshold: readIntEnv(env, 'PLAYER_CB_FAILURE_THRESHOLD', 5, { min: 1 }),
          openDurationMs: readIntEnv(env, 'PLAYER_CB_OPEN_DURATION_MS', 30000, { min: 1000 }),
          halfOpenSuccessThreshold: 2,
          windowSize: 10,
        },
        retry: {
          maxAttempts: readIntEnv(env, 'PLAYER_RETRY_MAX_ATTEMPTS', 3, { min: 1 }),
          baseDelayMs: 100,
          maxDelayMs: 5000,
        },
        bulkhead: {
          maxConcurrent: readIntEnv(env, 'PLAYER_BULKHEAD_MAX_CONCURRENT', 50, { min: 1 }),
          maxQueueSize: 100,
          queueTimeoutMs: 3000,
        },
        timeoutMs: readIntEnv(env, 'PLAYER_TIMEOUT_MS', 2000, { min: 100 }),
      },

      // Event service - less critical (audit trail, can be eventually consistent)
      event: {
        enabled,
        circuitBreaker: {
          failureThreshold: readIntEnv(env, 'EVENT_CB_FAILURE_THRESHOLD', 10, { min: 1 }),
          openDurationMs: readIntEnv(env, 'EVENT_CB_OPEN_DURATION_MS', 60000, { min: 1000 }),
          halfOpenSuccessThreshold: 3,
          windowSize: 20,
        },
        retry: {
          maxAttempts: readIntEnv(env, 'EVENT_RETRY_MAX_ATTEMPTS', 2, { min: 1 }),
          baseDelayMs: 50,
          maxDelayMs: 1000,
        },
        bulkhead: {
          maxConcurrent: readIntEnv(env, 'EVENT_BULKHEAD_MAX_CONCURRENT', 100, { min: 1 }),
          maxQueueSize: 200,
          queueTimeoutMs: 1000,
        },
        timeoutMs: readIntEnv(env, 'EVENT_TIMEOUT_MS', 1000, { min: 100 }),
      },

      // Notify service - non-critical (push notifications)
      notify: {
        enabled,
        circuitBreaker: {
          failureThreshold: readIntEnv(env, 'NOTIFY_CB_FAILURE_THRESHOLD', 10, { min: 1 }),
          openDurationMs: readIntEnv(env, 'NOTIFY_CB_OPEN_DURATION_MS', 60000, { min: 1000 }),
          halfOpenSuccessThreshold: 3,
          windowSize: 20,
        },
        retry: {
          maxAttempts: readIntEnv(env, 'NOTIFY_RETRY_MAX_ATTEMPTS', 2, { min: 1 }),
          baseDelayMs: 50,
          maxDelayMs: 1000,
        },
        bulkhead: {
          maxConcurrent: readIntEnv(env, 'NOTIFY_BULKHEAD_MAX_CONCURRENT', 100, { min: 1 }),
          maxQueueSize: 200,
          queueTimeoutMs: 1000,
        },
        timeoutMs: readIntEnv(env, 'NOTIFY_TIMEOUT_MS', 1000, { min: 100 }),
      },
    },
  };
}
