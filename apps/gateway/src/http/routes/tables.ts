import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  seatIdSchema,
  tableCreateRequestInputSchema,
  tableJoinSeatRequestSchema,
} from '@specify-poker/shared';
import { grpc } from '../../grpc/unaryClients';
import logger from '../../observability/logger';
import { requireUserId } from '../utils/requireUserId';
import { safeRoute } from '../utils/safeRoute';
import { createTablesFacade } from './tables/facade';

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
  params: { tableId: string; seatId: number; buyInAmount?: number },
): Promise<void> {
  const userId = requireUserId(req, res);
  if (!userId) return;

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

type ModerationAction = 'kick' | 'mute' | 'unmute';

type ModerationRequest = {
  readonly table_id: string;
  readonly owner_id: string;
  readonly target_user_id: string;
};

type ModerationMethod = (request: ModerationRequest) => Promise<unknown>;

type ModerationContext = {
  readonly tableId: string;
  readonly ownerId: string;
  readonly targetUserId: string;
  readonly seatId?: number;
};

type ModerationTargetResolution = Pick<ModerationContext, 'targetUserId' | 'seatId'>;

type ModerationTargetResolver = (params: {
  req: Request;
  res: Response;
  tableId: string;
  ownerId: string;
}) => Promise<ModerationTargetResolution | null>;

type ModerationResponseBuilder = (params: {
  req: Request;
  res: Response;
  action: ModerationAction;
  context: ModerationContext;
}) => Promise<void>;

type ModerationStrategy = {
  readonly action: ModerationAction;
  readonly method: ModerationMethod;
  readonly resolveTarget: ModerationTargetResolver;
  readonly respond: ModerationResponseBuilder;
};

const resolveModerationTargetFromBody: ModerationTargetResolver = async ({ req, res }) => {
  const rawTargetUserId = (req.body as { targetUserId?: unknown } | undefined)?.targetUserId;
  const targetUserId =
    typeof rawTargetUserId === 'string' && rawTargetUserId.trim().length > 0
      ? rawTargetUserId
      : null;
  if (!targetUserId) {
    res.status(400).json({ error: 'targetUserId is required' });
    return null;
  }
  return { targetUserId };
};

const resolveModerationTargetFromSeatId: ModerationTargetResolver = async ({
  req,
  res,
  tableId,
  ownerId,
}) => {
  const seatIdParsed = seatIdSchema.safeParse(req.body?.seatId);
  if (!seatIdParsed.success) {
    res.status(400).json({ error: 'seatId is required' });
    return null;
  }
  const seatId = seatIdParsed.data;

  const targetUserId = await tablesFacade.resolveTargetUserIdBySeatId({
    tableId,
    ownerId,
    seatId,
  });
  if (!targetUserId) {
    res.status(404).json({ error: 'Seat not occupied' });
    return null;
  }

  return { targetUserId, seatId };
};

const respondWithModerationOk: ModerationResponseBuilder = async ({ res }) => {
  res.json({ ok: true });
};

const respondWithSeatModerationAction: ModerationResponseBuilder = async ({
  res,
  action,
  context,
}) => {
  if (typeof context.seatId !== 'number') {
    res.status(500).json({ error: 'Moderation seatId missing' });
    return;
  }
  res.json({
    tableId: context.tableId,
    seatId: context.seatId,
    userId: context.targetUserId,
    action,
  });
};

const respondWithKickSeatModerationAction: ModerationResponseBuilder = async ({
  res,
  action,
  context,
}) => {
  if (typeof context.seatId !== 'number') {
    res.status(500).json({ error: 'Moderation seatId missing' });
    return;
  }

  const updated = await grpc.game.GetTableState({
    table_id: context.tableId,
    user_id: context.ownerId,
  });

  res.json({
    tableId: context.tableId,
    seatId: context.seatId,
    userId: context.targetUserId,
    action,
    tableState: updated.state,
  });
};

function createModerationHandler(strategy: ModerationStrategy) {
  return async (req: Request, res: Response) => {
    try {
      const { tableId } = req.params;
      const ownerId = requireUserId(req, res);
      if (!ownerId) return;

      const target = await strategy.resolveTarget({ req, res, tableId, ownerId });
      if (!target) {
        return;
      }

      const context: ModerationContext = {
        tableId,
        ownerId,
        targetUserId: target.targetUserId,
        ...(typeof target.seatId === 'number' ? { seatId: target.seatId } : {}),
      };

      await strategy.method({
        table_id: tableId,
        owner_id: ownerId,
        target_user_id: context.targetUserId,
      });

      await strategy.respond({ req, res, action: strategy.action, context });
    } catch (err) {
      logger.error({ err }, `Failed to ${strategy.action} player`);
      res.status(500).json({ error: `Failed to ${strategy.action} player` });
    }
  };
}

const handleKickByTargetUserId = createModerationHandler({
  action: 'kick',
  method: grpc.game.KickPlayer,
  resolveTarget: resolveModerationTargetFromBody,
  respond: respondWithModerationOk,
});

const handleMuteByTargetUserId = createModerationHandler({
  action: 'mute',
  method: grpc.game.MutePlayer,
  resolveTarget: resolveModerationTargetFromBody,
  respond: respondWithModerationOk,
});

const handleUnmuteByTargetUserId = createModerationHandler({
  action: 'unmute',
  method: grpc.game.UnmutePlayer,
  resolveTarget: resolveModerationTargetFromBody,
  respond: respondWithModerationOk,
});

const handleKickBySeatId = createModerationHandler({
  action: 'kick',
  method: grpc.game.KickPlayer,
  resolveTarget: resolveModerationTargetFromSeatId,
  respond: respondWithKickSeatModerationAction,
});

const handleMuteBySeatId = createModerationHandler({
  action: 'mute',
  method: grpc.game.MutePlayer,
  resolveTarget: resolveModerationTargetFromSeatId,
  respond: respondWithSeatModerationAction,
});

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
  safeRoute(
    async (req: Request, res: Response) => {
      const parsed = tableCreateRequestInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request' });
        return;
      }

      const { name, config } = parsed.data;
      const ownerId = requireUserId(req, res);
      if (!ownerId) return;

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
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      const parsed = tableJoinSeatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'seatId is required' });
        return;
      }

      const { seatId, buyInAmount } = parsed.data;
      return await handleJoinSeatRequest(req, res, { tableId, seatId, buyInAmount });
    },
    { logMessage: 'Failed to join seat' },
  ),
);

// POST /api/tables/:tableId/seats/:seatId/join - Join a seat
router.post(
  '/:tableId/seats/:seatId/join',
  safeRoute(
    async (req: Request, res: Response) => {
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
      return await handleJoinSeatRequest(req, res, { tableId, seatId: parsedSeatId, buyInAmount });
    },
    { logMessage: 'Failed to join seat' },
  ),
);

// POST /api/tables/:tableId/leave - Leave the table
router.post(
  '/:tableId/leave',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      const userId = requireUserId(req, res);
      if (!userId) return;

      const response = await grpc.game.LeaveSeat({
        table_id: tableId,
        user_id: userId,
      });

      return await handleOkGrpcResponse(res, response, 'Failed to leave seat');
    },
    { logMessage: 'Failed to leave seat' },
  ),
);

// POST /api/tables/:tableId/spectate - Join as spectator
router.post(
  '/:tableId/spectate',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      const userId = requireUserId(req, res);
      if (!userId) return;

      const response = await grpc.game.JoinSpectator({
        table_id: tableId,
        user_id: userId,
      });

      return await handleOkGrpcResponse(res, response, 'Failed to join as spectator');
    },
    { logMessage: 'Failed to join as spectator' },
  ),
);

// POST /api/tables/:tableId/spectate/leave - Leave spectating
router.post(
  '/:tableId/spectate/leave',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      const userId = requireUserId(req, res);
      if (!userId) return;

      const response = await grpc.game.LeaveSpectator({
        table_id: tableId,
        user_id: userId,
      });

      return await handleOkGrpcResponse(res, response, 'Failed to leave spectating');
    },
    { logMessage: 'Failed to leave spectating' },
  ),
);

// POST /api/tables/:tableId/action - Submit a game action
router.post(
  '/:tableId/action',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      const { actionType, amount } = req.body;
      const userId = requireUserId(req, res);
      if (!userId) return;

      const response = await grpc.game.SubmitAction({
        table_id: tableId,
        user_id: userId,
        action_type: actionType,
        amount: amount,
      });

      return await handleOkGrpcResponse(res, response, 'Invalid action');
    },
    { logMessage: 'Failed to submit action' },
  ),
);

// POST /api/tables/:tableId/moderation/kick - Kick by seatId (owner only)
router.post('/:tableId/moderation/kick', handleKickBySeatId);

// POST /api/tables/:tableId/moderation/mute - Mute by seatId (owner only)
router.post('/:tableId/moderation/mute', handleMuteBySeatId);

// POST /api/tables/:tableId/kick - Kick a player (owner only)
router.post('/:tableId/kick', handleKickByTargetUserId);

// POST /api/tables/:tableId/mute - Mute a player (owner only)
router.post('/:tableId/mute', handleMuteByTargetUserId);

// POST /api/tables/:tableId/unmute - Unmute a player (owner only)
router.post('/:tableId/unmute', handleUnmuteByTargetUserId);

export default router;
