import { createLazyUnaryCallProxy, type UnaryCallProxy } from "@specify-poker/shared";

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
  return {
    game: createLazyUnaryCallProxy(clientByKey.game),
    player: createLazyUnaryCallProxy(clientByKey.player),
    event: createLazyUnaryCallProxy(clientByKey.event),
    notify: createLazyUnaryCallProxy(clientByKey.notify),
  };
}

const defaultClientByKey: LazyGatewayGrpcClients = {
  game: () => clients.gameClient,
  player: () => clients.playerClient,
  event: () => clients.eventClient,
  notify: () => clients.notifyClient,
};

export const grpc = createGatewayGrpc(defaultClientByKey);
