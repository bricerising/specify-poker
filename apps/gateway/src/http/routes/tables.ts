import type { Request, Response } from 'express';
import { Router } from 'express';
import { tableCreateRequestInputSchema, tableJoinSeatRequestSchema } from '@specify-poker/shared';
import { grpc } from '../../grpc/unaryClients';
import { safeAuthedRoute } from '../utils/safeAuthedRoute';
import { safeRoute } from '../utils/safeRoute';
import { createTablesFacade } from './tables/facade';
import { attachModerationRoutes } from './tables/moderation';

const router = Router();

const tablesFacade = createTablesFacade();

function buildWsUrl(req: Request) {
  const host = req.get('host');
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto : req.protocol;
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
  return `${wsProtocol}://${host}/ws`;
}

async function handleJoinSeatRequest(
  req: Request,
  res: Response,
  userId: string,
  params: { tableId: string; seatId: number; buyInAmount?: number },
): Promise<void> {
  const response = await tablesFacade.joinSeatWithDailyBonus({
    tableId: params.tableId,
    userId,
    seatId: params.seatId,
    buyInAmount: params.buyInAmount ?? 0,
  });

  if (!response.ok) {
    res.status(400).json({ error: response.error || 'Failed to join seat' });
    return;
  }

  res.json({ tableId: params.tableId, seatId: params.seatId, wsUrl: buildWsUrl(req) });
}

type GrpcOkResponse = { ok: boolean; error?: string };

async function handleOkGrpcResponse(
  res: Response,
  response: GrpcOkResponse,
  fallbackError: string,
): Promise<void> {
  if (!response.ok) {
    res.status(400).json({ error: response.error || fallbackError });
    return;
  }
  res.json({ ok: true });
}

// GET /api/tables - List all tables
router.get(
  '/',
  safeRoute(
    async (_req: Request, res: Response) => {
      const response = await grpc.game.ListTables({});
      res.json(response.tables ?? []);
    },
    { logMessage: 'Failed to list tables' },
  ),
);

// POST /api/tables - Create a new table
router.post(
  '/',
  safeAuthedRoute(
    async (req: Request, res: Response, ownerId: string) => {
      const parsed = tableCreateRequestInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request' });
        return;
      }

      const { name, config } = parsed.data;

      const response = await grpc.game.CreateTable({
        name,
        owner_id: ownerId,
        config: {
          small_blind: config.smallBlind,
          big_blind: config.bigBlind,
          ante: config.ante ?? 0,
          max_players: config.maxPlayers,
          starting_stack: config.startingStack,
          turn_timer_seconds: config.turnTimerSeconds ?? 20,
        },
      });
      res.status(201).json(response);
    },
    { logMessage: 'Failed to create table' },
  ),
);

// GET /api/tables/:tableId - Get table details
router.get(
  '/:tableId',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      const response = await grpc.game.GetTable({ table_id: tableId });
      res.json(response);
    },
    {
      logMessage: 'Failed to get table',
      status: 404,
      errorMessage: 'Table not found',
      getLogContext: (req) => ({ tableId: req.params.tableId }),
    },
  ),
);

// DELETE /api/tables/:tableId - Delete a table
router.delete(
  '/:tableId',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      await grpc.game.DeleteTable({ table_id: tableId });
      res.status(204).send();
    },
    {
      logMessage: 'Failed to delete table',
      getLogContext: (req) => ({ tableId: req.params.tableId }),
    },
  ),
);

// GET /api/tables/:tableId/state - Get table state
router.get(
  '/:tableId/state',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      const userId = req.auth?.userId ?? '';
      const response = await grpc.game.GetTableState({
        table_id: tableId,
        user_id: userId,
      });
      res.json(response);
    },
    {
      logMessage: 'Failed to get table state',
      getLogContext: (req) => ({ tableId: req.params.tableId }),
    },
  ),
);

// POST /api/tables/:tableId/join - Join a seat (body includes seatId)
router.post(
  '/:tableId/join',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const { tableId } = req.params;
      const parsed = tableJoinSeatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'seatId is required' });
        return;
      }

      const { seatId, buyInAmount } = parsed.data;
      await handleJoinSeatRequest(req, res, userId, { tableId, seatId, buyInAmount });
    },
    { logMessage: 'Failed to join seat' },
  ),
);

// POST /api/tables/:tableId/seats/:seatId/join - Join a seat
router.post(
  '/:tableId/seats/:seatId/join',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const { tableId, seatId } = req.params;
      const parsed = tableJoinSeatRequestSchema.safeParse({
        seatId,
        buyInAmount: req.body?.buyInAmount,
      });
      if (!parsed.success) {
        res.status(400).json({ error: 'seatId is required' });
        return;
      }

      const { seatId: parsedSeatId, buyInAmount } = parsed.data;
      await handleJoinSeatRequest(req, res, userId, {
        tableId,
        seatId: parsedSeatId,
        buyInAmount,
      });
    },
    { logMessage: 'Failed to join seat' },
  ),
);

// POST /api/tables/:tableId/leave - Leave the table
router.post(
  '/:tableId/leave',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const { tableId } = req.params;

      const response = await grpc.game.LeaveSeat({
        table_id: tableId,
        user_id: userId,
      });

      await handleOkGrpcResponse(res, response, 'Failed to leave seat');
    },
    { logMessage: 'Failed to leave seat' },
  ),
);

// POST /api/tables/:tableId/spectate - Join as spectator
router.post(
  '/:tableId/spectate',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const { tableId } = req.params;

      const response = await grpc.game.JoinSpectator({
        table_id: tableId,
        user_id: userId,
      });

      await handleOkGrpcResponse(res, response, 'Failed to join as spectator');
    },
    { logMessage: 'Failed to join as spectator' },
  ),
);

// POST /api/tables/:tableId/spectate/leave - Leave spectating
router.post(
  '/:tableId/spectate/leave',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const { tableId } = req.params;

      const response = await grpc.game.LeaveSpectator({
        table_id: tableId,
        user_id: userId,
      });

      await handleOkGrpcResponse(res, response, 'Failed to leave spectating');
    },
    { logMessage: 'Failed to leave spectating' },
  ),
);

// POST /api/tables/:tableId/action - Submit a game action
router.post(
  '/:tableId/action',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const { tableId } = req.params;
      const { actionType, amount } = req.body;

      const response = await grpc.game.SubmitAction({
        table_id: tableId,
        user_id: userId,
        action_type: actionType,
        amount: amount,
      });

      await handleOkGrpcResponse(res, response, 'Invalid action');
    },
    { logMessage: 'Failed to submit action' },
  ),
);

attachModerationRoutes(router, { tablesFacade, grpcGame: grpc.game });

export default router;
