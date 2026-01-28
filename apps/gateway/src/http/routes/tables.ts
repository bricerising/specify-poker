import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  seatIdSchema,
  tableCreateRequestInputSchema,
  tableJoinSeatRequestSchema,
} from '@specify-poker/shared';
import { grpc } from '../../grpc/unaryClients';
import logger from '../../observability/logger';
import { getConfig } from '../../config';
import { requireUserId } from '../utils/requireUserId';
import { isRecord } from '../../utils/json';

const router = Router();

const DAILY_LOGIN_BONUS_CHIPS = 1000;

function buildWsUrl(req: Request) {
  const host = req.get('host');
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto : req.protocol;
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
  return `${wsProtocol}://${host}/ws`;
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function balanceBaseUrl(): string {
  const config = getConfig();
  return config.balanceServiceHttpUrl.startsWith('http')
    ? config.balanceServiceHttpUrl
    : `http://${config.balanceServiceHttpUrl}`;
}

async function ensureDailyLoginBonus(userId: string): Promise<void> {
  const date = isoDate();
  const idempotencyKey = `bonus:daily_login:lobby:${userId}:${date}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  try {
    const response = await fetch(
      `${balanceBaseUrl()}/api/accounts/${encodeURIComponent(userId)}/deposit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-gateway-user-id': userId,
        },
        body: JSON.stringify({ amount: DAILY_LOGIN_BONUS_CHIPS, source: 'BONUS' }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.warn({ userId, status: response.status, body }, 'daily_login_bonus.failed');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    logger.warn({ userId, message }, 'daily_login_bonus.error');
  } finally {
    clearTimeout(timeout);
  }
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readSeatId(seat: unknown): number | null {
  if (!isRecord(seat)) {
    return null;
  }

  const raw = seat.seat_id ?? seat.seatId;
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function readSeatUserId(seat: unknown): string | null {
  if (!isRecord(seat)) {
    return null;
  }

  return readNonEmptyString(seat.user_id ?? seat.userId);
}

type JoinSeatResponse = { ok: boolean; error?: string };

const DAILY_LOGIN_BONUS_ERRORS = new Set(['ACCOUNT_NOT_FOUND', 'INSUFFICIENT_BALANCE']);

async function joinSeatWithDailyBonus(request: {
  table_id: string;
  user_id: string;
  seat_id: number;
  buy_in_amount: number;
}): Promise<JoinSeatResponse> {
  let response = (await grpc.game.JoinSeat(request)) as JoinSeatResponse;
  if (!response.ok && DAILY_LOGIN_BONUS_ERRORS.has(response.error ?? '')) {
    await ensureDailyLoginBonus(request.user_id);
    response = (await grpc.game.JoinSeat(request)) as JoinSeatResponse;
  }
  return response;
}

async function resolveTargetUserIdBySeatId(params: {
  tableId: string;
  ownerId: string;
  seatId: number;
}): Promise<string | null> {
  const stateResponse = await grpc.game.GetTableState({
    table_id: params.tableId,
    user_id: params.ownerId,
  });

  const seats = Array.isArray(stateResponse.state?.seats)
    ? (stateResponse.state.seats as unknown[])
    : [];
  const seat = seats.find((candidate) => readSeatId(candidate) === params.seatId);
  return readSeatUserId(seat);
}

async function handleJoinSeatRequest(
  req: Request,
  res: Response,
  params: { tableId: string; seatId: number; buyInAmount?: number },
) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const joinRequest: Parameters<typeof joinSeatWithDailyBonus>[0] = {
    table_id: params.tableId,
    user_id: userId,
    seat_id: params.seatId,
    buy_in_amount: params.buyInAmount ?? 0,
  };

  const response = await joinSeatWithDailyBonus(joinRequest);

  if (!response.ok) {
    return res.status(400).json({ error: response.error || 'Failed to join seat' });
  }

  return res.json({ tableId: params.tableId, seatId: params.seatId, wsUrl: buildWsUrl(req) });
}

type GrpcOkResponse = { ok: boolean; error?: string };

async function handleOkGrpcResponse(
  res: Response,
  response: GrpcOkResponse,
  fallbackError: string,
) {
  if (!response.ok) {
    return res.status(400).json({ error: response.error || fallbackError });
  }
  return res.json({ ok: true });
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
  const targetUserId = readNonEmptyString(
    (req.body as { targetUserId?: unknown } | undefined)?.targetUserId,
  );
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

  const targetUserId = await resolveTargetUserIdBySeatId({ tableId, ownerId, seatId });
  if (!targetUserId) {
    res.status(404).json({ error: 'Seat not occupied' });
    return null;
  }

  return { targetUserId, seatId };
};

const respondWithModerationOk: ModerationResponseBuilder = async ({ res }) => {
  res.json({ ok: true });
};

const respondWithSeatModerationAction: ModerationResponseBuilder = async ({ res, action, context }) => {
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
router.get('/', async (_req: Request, res: Response) => {
  try {
    const response = await grpc.game.ListTables({});
    res.json(response.tables || []);
  } catch (err) {
    logger.error({ err }, 'Failed to list tables');
    res.status(500).json({ error: 'Failed to list tables' });
  }
});

// POST /api/tables - Create a new table
router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = tableCreateRequestInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
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
    return res.status(201).json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to create table');
    return res.status(500).json({ error: 'Failed to create table' });
  }
});

// GET /api/tables/:tableId - Get table details
router.get('/:tableId', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const response = await grpc.game.GetTable({ table_id: tableId });
    res.json(response);
  } catch (err) {
    logger.error({ err, tableId: req.params.tableId }, 'Failed to get table');
    res.status(404).json({ error: 'Table not found' });
  }
});

// DELETE /api/tables/:tableId - Delete a table
router.delete('/:tableId', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    await grpc.game.DeleteTable({ table_id: tableId });
    res.status(204).send();
  } catch (err) {
    logger.error({ err, tableId: req.params.tableId }, 'Failed to delete table');
    res.status(500).json({ error: 'Failed to delete table' });
  }
});

// GET /api/tables/:tableId/state - Get table state
router.get('/:tableId/state', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = req.auth?.userId ?? '';
    const response = await grpc.game.GetTableState({
      table_id: tableId,
      user_id: userId,
    });
    res.json(response);
  } catch (err) {
    logger.error({ err, tableId: req.params.tableId }, 'Failed to get table state');
    res.status(500).json({ error: 'Failed to get table state' });
  }
});

// POST /api/tables/:tableId/join - Join a seat (body includes seatId)
router.post('/:tableId/join', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const parsed = tableJoinSeatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'seatId is required' });
    }

    const { seatId, buyInAmount } = parsed.data;
    return await handleJoinSeatRequest(req, res, { tableId, seatId, buyInAmount });
  } catch (err) {
    logger.error({ err }, 'Failed to join seat');
    return res.status(500).json({ error: 'Failed to join seat' });
  }
});

// POST /api/tables/:tableId/seats/:seatId/join - Join a seat
router.post('/:tableId/seats/:seatId/join', async (req: Request, res: Response) => {
  try {
    const { tableId, seatId } = req.params;
    const parsed = tableJoinSeatRequestSchema.safeParse({
      seatId,
      buyInAmount: req.body?.buyInAmount,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: 'seatId is required' });
    }

    const { seatId: parsedSeatId, buyInAmount } = parsed.data;
    return await handleJoinSeatRequest(req, res, { tableId, seatId: parsedSeatId, buyInAmount });
  } catch (err) {
    logger.error({ err }, 'Failed to join seat');
    return res.status(500).json({ error: 'Failed to join seat' });
  }
});

// POST /api/tables/:tableId/leave - Leave the table
router.post('/:tableId/leave', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = (await grpc.game.LeaveSeat({
      table_id: tableId,
      user_id: userId,
    })) as GrpcOkResponse;

    return await handleOkGrpcResponse(res, response, 'Failed to leave seat');
  } catch (err) {
    logger.error({ err }, 'Failed to leave seat');
    return res.status(500).json({ error: 'Failed to leave seat' });
  }
});

// POST /api/tables/:tableId/spectate - Join as spectator
router.post('/:tableId/spectate', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = (await grpc.game.JoinSpectator({
      table_id: tableId,
      user_id: userId,
    })) as GrpcOkResponse;

    return await handleOkGrpcResponse(res, response, 'Failed to join as spectator');
  } catch (err) {
    logger.error({ err }, 'Failed to join as spectator');
    return res.status(500).json({ error: 'Failed to join as spectator' });
  }
});

// POST /api/tables/:tableId/spectate/leave - Leave spectating
router.post('/:tableId/spectate/leave', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = (await grpc.game.LeaveSpectator({
      table_id: tableId,
      user_id: userId,
    })) as GrpcOkResponse;

    return await handleOkGrpcResponse(res, response, 'Failed to leave spectating');
  } catch (err) {
    logger.error({ err }, 'Failed to leave spectating');
    return res.status(500).json({ error: 'Failed to leave spectating' });
  }
});

// POST /api/tables/:tableId/action - Submit a game action
router.post('/:tableId/action', async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { actionType, amount } = req.body;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = (await grpc.game.SubmitAction({
      table_id: tableId,
      user_id: userId,
      action_type: actionType,
      amount: amount,
    })) as GrpcOkResponse;

    return await handleOkGrpcResponse(res, response, 'Invalid action');
  } catch (err) {
    logger.error({ err }, 'Failed to submit action');
    return res.status(500).json({ error: 'Failed to submit action' });
  }
});

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
