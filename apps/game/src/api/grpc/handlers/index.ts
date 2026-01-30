import type { sendUnaryData, ServerUnaryCall, ServiceError } from '@grpc/grpc-js';
import { createUnaryHandler, withUnaryErrorHandling, withUnaryTiming } from '@specify-poker/shared';
import type { GameService } from '../../../services/gameService';
import { gameService as defaultGameService } from '../../../services/gameService';
import { recordGrpcRequest } from '../../../observability/metrics';
import { toServiceError } from './grpcError';
import { createGameGrpcAdapter } from './gameGrpcAdapter';

function createGameUnaryHandler<Req, Res>(
  method: string,
  handler: (request: Req) => Promise<Res> | Res,
): (call: ServerUnaryCall<Req, Res>, callback: sendUnaryData<Res>) => Promise<void> {
  return createUnaryHandler<Req, Res, ServerUnaryCall<Req, Res>, ServiceError>({
    handler: ({ request }) => handler(request),
    interceptors: [
      withUnaryTiming({ method, record: recordGrpcRequest }),
      withUnaryErrorHandling({ method, toServiceError }),
    ],
  });
}

export function createHandlers(deps: { gameService?: GameService } = {}) {
  const gameService = deps.gameService ?? defaultGameService;
  const adapter = createGameGrpcAdapter(gameService);

  return {
    CreateTable: createGameUnaryHandler('CreateTable', adapter.CreateTable),
    GetTable: createGameUnaryHandler('GetTable', adapter.GetTable),
    ListTables: createGameUnaryHandler('ListTables', adapter.ListTables),
    DeleteTable: createGameUnaryHandler('DeleteTable', adapter.DeleteTable),
    GetTableState: createGameUnaryHandler('GetTableState', adapter.GetTableState),
    JoinSeat: createGameUnaryHandler('JoinSeat', adapter.JoinSeat),
    LeaveSeat: createGameUnaryHandler('LeaveSeat', adapter.LeaveSeat),
    JoinSpectator: createGameUnaryHandler('JoinSpectator', adapter.JoinSpectator),
    LeaveSpectator: createGameUnaryHandler('LeaveSpectator', adapter.LeaveSpectator),
    SubmitAction: createGameUnaryHandler('SubmitAction', adapter.SubmitAction),
    KickPlayer: createGameUnaryHandler('KickPlayer', adapter.KickPlayer),
    MutePlayer: createGameUnaryHandler('MutePlayer', adapter.MutePlayer),
    UnmutePlayer: createGameUnaryHandler('UnmutePlayer', adapter.UnmutePlayer),
    IsMuted: createGameUnaryHandler('IsMuted', adapter.IsMuted),
  };
}
