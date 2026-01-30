import { Router } from 'express';
import healthRoutes from './routes/health';
import { authMiddleware } from './middleware/auth';
import type { BalanceService } from '../../services/balanceService';
import { balanceService } from '../../services/balanceService';
import { createAccountRoutes } from './routes/accounts';

export function createHttpRouter(service: BalanceService = balanceService): Router {
  const router = Router();

  // Health routes (no auth)
  router.use('/api', healthRoutes);

  // Auth middleware for account routes
  router.use(authMiddleware);

  // Account routes
  router.use('/api/accounts', createAccountRoutes(service));

  return router;
}
