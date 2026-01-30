import { randomUUID } from 'crypto';

import { balanceClient } from '../clients/balanceClient';
import { publishEvent } from '../clients/eventClient';
import logger from '../observability/logger';
import {
  recordAction,
  recordHandCompleted,
  recordHandStarted,
  recordSeatJoin,
  recordTurnTime,
  recordTurnTimeout,
  setActiveTables,
  setSeatedPlayers,
  setSpectatorCount,
} from '../observability/metrics';
import { tableStateStore } from '../storage/tableStateStore';
import { tableStore } from '../storage/tableStore';
import { createBalanceTableEconomy } from './table/tableEconomy';
import { createTablePublisher } from './table/tablePublisher';
import { createTableQueries } from './table/tableQueries';
import { gatewayWsPublisher } from './table/gatewayWsPublisher';
import { TableService, type TableServiceDeps } from './table/tableService';

export { TableService, type TableServiceDeps } from './table/tableService';

export function createTableService(overrides: Partial<TableServiceDeps> = {}): TableService {
  const resolvedTableStore = overrides.tableStore ?? tableStore;
  const resolvedTableStateStore = overrides.tableStateStore ?? tableStateStore;
  const resolvedBalanceClient = overrides.balanceClient ?? balanceClient;

  const tableQueries =
    overrides.tableQueries ??
    createTableQueries({ tableStore: resolvedTableStore, tableStateStore: resolvedTableStateStore });
  const tableEconomy =
    overrides.tableEconomy ?? createBalanceTableEconomy({ balanceClient: resolvedBalanceClient });

  const metrics: TableServiceDeps['metrics'] =
    overrides.metrics ??
    ({
      recordAction,
      recordHandCompleted,
      recordHandStarted,
      recordSeatJoin,
      recordTurnTime,
      recordTurnTimeout,
      setActiveTables,
      setSeatedPlayers,
      setSpectatorCount,
    } satisfies TableServiceDeps['metrics']);

  const publisher =
    overrides.publisher ??
    createTablePublisher({
      tableQueries,
      gatewayPublisher: gatewayWsPublisher,
      metrics,
    });

  return new TableService({
    tableQueries,
    tableEconomy,
    tableStore: resolvedTableStore,
    tableStateStore: resolvedTableStateStore,
    publisher,
    balanceClient: resolvedBalanceClient,
    publishEvent: overrides.publishEvent ?? publishEvent,
    metrics,
    logger: overrides.logger ?? logger,
    clock: overrides.clock ?? { nowIso: () => new Date().toISOString() },
    ids: overrides.ids ?? { randomUUID },
  });
}

export const tableService = createTableService();
