import type { Router } from 'express';
import { createHttpRouter } from './http/router';
import { createGrpcHandlers, type GrpcHandlers } from './grpc/handlers';
import type { BalanceService } from '../services/balanceService';
import { balanceService } from '../services/balanceService';

export type BalanceApi = {
  httpRouter: Router;
  grpcHandlers: GrpcHandlers;
};

export function createBalanceApi(service?: BalanceService): BalanceApi {
  const effectiveService = service ?? balanceService;
  return {
    httpRouter: createHttpRouter(effectiveService),
    grpcHandlers: createGrpcHandlers(effectiveService),
  };
}
