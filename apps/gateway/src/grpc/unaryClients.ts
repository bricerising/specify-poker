import {
  createLazyUnaryCallProxy,
  createLazyUnaryCallResultProxy,
  type UnaryCallProxy,
  type UnaryCallResultProxy,
} from '@specify-poker/shared';

import type {
  EventServiceClient,
  GameServiceClient,
  NotifyServiceClient,
  PlayerServiceClient,
} from '../types';
import { getEventClient, getGameClient, getNotifyClient, getPlayerClient } from './clients';

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

export function createGatewayGrpc(clientByKey: LazyGatewayGrpcClients): GatewayGrpc {
  return {
    game: createLazyUnaryCallProxy(clientByKey.game),
    player: createLazyUnaryCallProxy(clientByKey.player),
    event: createLazyUnaryCallProxy(clientByKey.event),
    notify: createLazyUnaryCallProxy(clientByKey.notify),
  };
}

export function createGatewayGrpcResult(clientByKey: LazyGatewayGrpcClients): GatewayGrpcResult {
  return {
    game: createLazyUnaryCallResultProxy(clientByKey.game),
    player: createLazyUnaryCallResultProxy(clientByKey.player),
    event: createLazyUnaryCallResultProxy(clientByKey.event),
    notify: createLazyUnaryCallResultProxy(clientByKey.notify),
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
