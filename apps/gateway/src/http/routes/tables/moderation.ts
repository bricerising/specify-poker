import type { Request, Response, Router } from 'express';
import { seatIdSchema } from '@specify-poker/shared';
import type { GatewayGrpc } from '../../../grpc/unaryClients';
import type { TablesFacade } from './facade';
import logger from '../../../observability/logger';
import { requireUserId } from '../../utils/requireUserId';
import { getIdempotencyKey } from '../../utils/idempotencyKey';

type ModerationAction = 'kick' | 'mute' | 'unmute';

type ModerationRequest = {
  readonly table_id: string;
  readonly owner_id: string;
  readonly target_user_id: string;
  readonly idempotency_key: string;
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

type TablesModerationDeps = {
  readonly grpcGame: GatewayGrpc['game'];
  readonly tablesFacade: TablesFacade;
  readonly logger: Pick<typeof logger, 'error'>;
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

function createSeatTargetResolver(tablesFacade: TablesFacade): ModerationTargetResolver {
  return async ({ req, res, tableId, ownerId }) => {
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
}

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

function createKickSeatResponse(grpcGame: GatewayGrpc['game']): ModerationResponseBuilder {
  return async ({ res, action, context }) => {
    if (typeof context.seatId !== 'number') {
      res.status(500).json({ error: 'Moderation seatId missing' });
      return;
    }

    const updated = await grpcGame.GetTableState({
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
}

function createModerationHandler(deps: TablesModerationDeps, strategy: ModerationStrategy) {
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

      const idempotencyKey = getIdempotencyKey(req);
      await strategy.method({
        table_id: tableId,
        owner_id: ownerId,
        target_user_id: context.targetUserId,
        idempotency_key: idempotencyKey,
      });

      await strategy.respond({ req, res, action: strategy.action, context });
    } catch (err: unknown) {
      deps.logger.error({ err }, `Failed to ${strategy.action} player`);
      res.status(500).json({ error: `Failed to ${strategy.action} player` });
    }
  };
}

export function attachModerationRoutes(
  router: Router,
  overrides: Partial<TablesModerationDeps> & Pick<TablesModerationDeps, 'tablesFacade' | 'grpcGame'>,
): void {
  const deps: TablesModerationDeps = {
    logger,
    ...overrides,
  };

  const resolveModerationTargetFromSeatId = createSeatTargetResolver(deps.tablesFacade);

  const handleKickByTargetUserId = createModerationHandler(deps, {
    action: 'kick',
    method: deps.grpcGame.KickPlayer,
    resolveTarget: resolveModerationTargetFromBody,
    respond: respondWithModerationOk,
  });

  const handleMuteByTargetUserId = createModerationHandler(deps, {
    action: 'mute',
    method: deps.grpcGame.MutePlayer,
    resolveTarget: resolveModerationTargetFromBody,
    respond: respondWithModerationOk,
  });

  const handleUnmuteByTargetUserId = createModerationHandler(deps, {
    action: 'unmute',
    method: deps.grpcGame.UnmutePlayer,
    resolveTarget: resolveModerationTargetFromBody,
    respond: respondWithModerationOk,
  });

  const handleKickBySeatId = createModerationHandler(deps, {
    action: 'kick',
    method: deps.grpcGame.KickPlayer,
    resolveTarget: resolveModerationTargetFromSeatId,
    respond: createKickSeatResponse(deps.grpcGame),
  });

  const handleMuteBySeatId = createModerationHandler(deps, {
    action: 'mute',
    method: deps.grpcGame.MutePlayer,
    resolveTarget: resolveModerationTargetFromSeatId,
    respond: respondWithSeatModerationAction,
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
}
