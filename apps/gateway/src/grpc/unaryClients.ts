import {
  createLazyUnaryCallProxy,
  createLazyUnaryCallResultProxy,
  type UnaryCallProxy,
  type UnaryCallResultProxy,
  type UnaryCallOptions,
} from '@specify-poker/shared';

import type {
  EventServiceClient,
  GameServiceClient,
  NotifyServiceClient,
  PlayerServiceClient,
} from '../types';
import { getEventClient, getGameClient, getNotifyClient, getPlayerClient } from './clients';
import { getConfig } from '../config';

export type GatewayGrpcClients = {
  game: GameServiceClient;
  player: PlayerServiceClient;
  event: EventServiceClient;
  notify: NotifyServiceClient;
};

export type GatewayGrpc = {
  [K in keyof GatewayGrpcClients]: UnaryCallProxy<GatewayGrpcClients[K]>;
};

export type GatewayGrpcResult = {
  [K in keyof GatewayGrpcClients]: UnaryCallResultProxy<GatewayGrpcClients[K]>;
};

type GatewayGrpcKey = keyof GatewayGrpcClients;

export type LazyGatewayGrpcClients = {
  [K in GatewayGrpcKey]: () => GatewayGrpcClients[K];
};

function withDefaultUnaryCallOptions<TClient extends object>(options: {
  client: UnaryCallProxy<TClient>;
  getDefaults: () => UnaryCallOptions;
}): UnaryCallProxy<TClient> {
  return new Proxy(options.client as unknown as Record<string, unknown>, {
    get: (target, prop) => {
      const value = target[prop as keyof typeof target];
      if (typeof value !== 'function') {
        return value;
      }

      return (request: unknown, callOptions?: UnaryCallOptions) => {
        const defaults = options.getDefaults();
        return (value as (request: unknown, callOptions?: UnaryCallOptions) => Promise<unknown>)(
          request,
          callOptions ? { ...callOptions, timeoutMs: callOptions.timeoutMs ?? defaults.timeoutMs } : defaults,
        );
      };
    },
  }) as unknown as UnaryCallProxy<TClient>;
}

function withDefaultUnaryCallResultOptions<TClient extends object>(options: {
  client: UnaryCallResultProxy<TClient>;
  getDefaults: () => UnaryCallOptions;
}): UnaryCallResultProxy<TClient> {
  return new Proxy(options.client as unknown as Record<string, unknown>, {
    get: (target, prop) => {
      const value = target[prop as keyof typeof target];
      if (typeof value !== 'function') {
        return value;
      }

      return (request: unknown, callOptions?: UnaryCallOptions) => {
        const defaults = options.getDefaults();
        return (value as (request: unknown, callOptions?: UnaryCallOptions) => Promise<unknown>)(
          request,
          callOptions ? { ...callOptions, timeoutMs: callOptions.timeoutMs ?? defaults.timeoutMs } : defaults,
        );
      };
    },
  }) as unknown as UnaryCallResultProxy<TClient>;
}

function getDefaultUnaryCallOptions(): UnaryCallOptions {
  const timeoutMs = getConfig().grpcClientTimeoutMs;
  return { timeoutMs };
}

export function createGatewayGrpc(clientByKey: LazyGatewayGrpcClients): GatewayGrpc {
  return {
    game: withDefaultUnaryCallOptions({
      client: createLazyUnaryCallProxy(clientByKey.game),
      getDefaults: getDefaultUnaryCallOptions,
    }),
    player: withDefaultUnaryCallOptions({
      client: createLazyUnaryCallProxy(clientByKey.player),
      getDefaults: getDefaultUnaryCallOptions,
    }),
    event: withDefaultUnaryCallOptions({
      client: createLazyUnaryCallProxy(clientByKey.event),
      getDefaults: getDefaultUnaryCallOptions,
    }),
    notify: withDefaultUnaryCallOptions({
      client: createLazyUnaryCallProxy(clientByKey.notify),
      getDefaults: getDefaultUnaryCallOptions,
    }),
  };
}

export function createGatewayGrpcResult(clientByKey: LazyGatewayGrpcClients): GatewayGrpcResult {
  return {
    game: withDefaultUnaryCallResultOptions({
      client: createLazyUnaryCallResultProxy(clientByKey.game),
      getDefaults: getDefaultUnaryCallOptions,
    }),
    player: withDefaultUnaryCallResultOptions({
      client: createLazyUnaryCallResultProxy(clientByKey.player),
      getDefaults: getDefaultUnaryCallOptions,
    }),
    event: withDefaultUnaryCallResultOptions({
      client: createLazyUnaryCallResultProxy(clientByKey.event),
      getDefaults: getDefaultUnaryCallOptions,
    }),
    notify: withDefaultUnaryCallResultOptions({
      client: createLazyUnaryCallResultProxy(clientByKey.notify),
      getDefaults: getDefaultUnaryCallOptions,
    }),
  };
}

const defaultClientByKey: LazyGatewayGrpcClients = {
  game: getGameClient,
  player: getPlayerClient,
  event: getEventClient,
  notify: getNotifyClient,
};

export const grpc = createGatewayGrpc(defaultClientByKey);
export const grpcResult = createGatewayGrpcResult(defaultClientByKey);
