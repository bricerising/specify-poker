/**
 * Resilient gRPC client wrappers for the gateway.
 *
 * Wraps standard gRPC clients with resilience patterns (circuit breaker, retry, bulkhead).
 * Each service has its own resilience configuration based on criticality.
 */

import {
  createServiceResilienceManager,
  type ServiceResilienceManager,
  type ServiceResilienceEvents,
  type UnaryCallProxy,
} from '@specify-poker/shared';

import type { GatewayGrpc, LazyGatewayGrpcClients } from './unaryClients';
import { createGatewayGrpc } from './unaryClients';
import { getEventClient, getGameClient, getNotifyClient, getPlayerClient } from './clients';
import { loadResilienceConfig, type GatewayResilienceConfig } from '../resilience/config';
import logger from '../observability/logger';

/**
 * Wraps a UnaryCallProxy with resilience patterns.
 *
 * Each method call goes through: Bulkhead → Circuit Breaker → Retry → Original Call
 */
export function withResilience<TClient extends object>(
  client: UnaryCallProxy<TClient>,
  serviceName: string,
  resilienceManager: ServiceResilienceManager,
): UnaryCallProxy<TClient> {
  const executor = resilienceManager.getExecutor(serviceName);

  return new Proxy(client as unknown as Record<string, unknown>, {
    get: (target, prop) => {
      const value = target[prop as keyof typeof target];
      if (typeof value !== 'function') {
        return value;
      }

      // Wrap the original method with resilience
      return async (...args: unknown[]) => {
        return executor(() => (value as (...args: unknown[]) => Promise<unknown>)(...args));
      };
    },
  }) as unknown as UnaryCallProxy<TClient>;
}

/**
 * Creates resilience event handlers that log and emit metrics.
 */
function createResilienceEventHandlers(): ServiceResilienceEvents {
  return {
    onCircuitStateChange: (serviceName, from, to) => {
      logger.warn(
        { serviceName, from, to },
        'resilience.circuit_breaker.state_change',
      );
    },
    onRetry: (serviceName, attempt, error, delayMs) => {
      logger.info(
        { serviceName, attempt, delayMs, error: error instanceof Error ? error.message : String(error) },
        'resilience.retry.attempt',
      );
    },
    onBulkheadRejected: (serviceName, reason) => {
      logger.warn(
        { serviceName, reason },
        'resilience.bulkhead.rejected',
      );
    },
    onCircuitRejected: (serviceName) => {
      logger.warn(
        { serviceName },
        'resilience.circuit_breaker.rejected',
      );
    },
  };
}

export type ResilientGatewayGrpcOptions = {
  /** Resilience configuration (loaded from env if not provided) */
  config?: GatewayResilienceConfig;
  /** Custom event handlers */
  events?: ServiceResilienceEvents;
};

/**
 * Creates gateway gRPC clients wrapped with per-service resilience.
 */
export function createResilientGatewayGrpc(
  clientByKey: LazyGatewayGrpcClients,
  options?: ResilientGatewayGrpcOptions,
): { grpc: GatewayGrpc; resilienceManager: ServiceResilienceManager } {
  const config = options?.config ?? loadResilienceConfig(process.env);

  if (!config.enabled) {
    // Return non-resilient clients
    return {
      grpc: createGatewayGrpc(clientByKey),
      resilienceManager: createServiceResilienceManager({}),
    };
  }

  const events = options?.events ?? createResilienceEventHandlers();
  const resilienceManager = createServiceResilienceManager(config.services, events);

  // Create base gRPC clients
  const baseGrpc = createGatewayGrpc(clientByKey);

  // Wrap with resilience
  const resilientGrpc: GatewayGrpc = {
    game: withResilience(baseGrpc.game, 'game', resilienceManager),
    player: withResilience(baseGrpc.player, 'player', resilienceManager),
    event: withResilience(baseGrpc.event, 'event', resilienceManager),
    notify: withResilience(baseGrpc.notify, 'notify', resilienceManager),
  };

  return {
    grpc: resilientGrpc,
    resilienceManager,
  };
}

// Singleton instance (lazy initialized)
let resilientInstance: { grpc: GatewayGrpc; resilienceManager: ServiceResilienceManager } | null = null;

/**
 * Gets or creates the resilient gateway gRPC clients.
 * Uses lazy initialization to ensure config is loaded after bootstrap.
 */
export function getResilientGatewayGrpc(): { grpc: GatewayGrpc; resilienceManager: ServiceResilienceManager } {
  if (!resilientInstance) {
    resilientInstance = createResilientGatewayGrpc({
      game: getGameClient,
      player: getPlayerClient,
      event: getEventClient,
      notify: getNotifyClient,
    });
  }
  return resilientInstance;
}

/**
 * Resets the singleton instance (for testing).
 */
export function resetResilientGatewayGrpc(): void {
  resilientInstance = null;
}
