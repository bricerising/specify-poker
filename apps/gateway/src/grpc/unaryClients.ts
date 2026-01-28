import { createUnaryCallProxy, type UnaryCallProxy } from "@specify-poker/shared";

import type { EventServiceClient, GameServiceClient, NotifyServiceClient, PlayerServiceClient } from "../types";
import * as clients from "./clients";

export type GatewayGrpcClients = {
  game: GameServiceClient;
  player: PlayerServiceClient;
  event: EventServiceClient;
  notify: NotifyServiceClient;
};

export type GatewayGrpc = {
  [K in keyof GatewayGrpcClients]: UnaryCallProxy<GatewayGrpcClients[K]>;
};

type GatewayGrpcKey = keyof GatewayGrpcClients;

export type LazyGatewayGrpcClients = {
  [K in GatewayGrpcKey]: () => GatewayGrpcClients[K];
};

export function createGatewayGrpc(clientByKey: LazyGatewayGrpcClients): GatewayGrpc {
  const cache: Partial<GatewayGrpc> = {};

  function getGrpcClient<K extends GatewayGrpcKey>(key: K): GatewayGrpc[K] {
    const existing = cache[key];
    if (existing) {
      return existing;
    }

    const proxy = createUnaryCallProxy(clientByKey[key]()) as GatewayGrpc[K];
    cache[key] = proxy;
    return proxy;
  }

  return {
    get game() {
      return getGrpcClient("game");
    },
    get player() {
      return getGrpcClient("player");
    },
    get event() {
      return getGrpcClient("event");
    },
    get notify() {
      return getGrpcClient("notify");
    },
  };
}

const defaultClientByKey: LazyGatewayGrpcClients = {
  game: () => clients.gameClient,
  player: () => clients.playerClient,
  event: () => clients.eventClient,
  notify: () => clients.notifyClient,
};

export const grpc = createGatewayGrpc(defaultClientByKey);
