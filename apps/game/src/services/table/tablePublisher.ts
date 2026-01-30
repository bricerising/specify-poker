import type { Table, TableState } from '../../domain/types';
import type { TableQueries, TableSummariesSnapshot } from './tableQueries';
import type { GatewayWsPublisher } from './gatewayWsPublisher';

type MetricsLike = {
  setActiveTables(count: number): void;
  setSeatedPlayers(count: number): void;
  setSpectatorCount(count: number): void;
};

type GatewayPublisherLike = Pick<GatewayWsPublisher, 'publishTableState' | 'publishLobbyUpdate'>;

export type TablePublisherDeps = {
  readonly tableQueries: TableQueries;
  readonly gatewayPublisher: GatewayPublisherLike;
  readonly metrics: MetricsLike;
};

export type TablePublisher = {
  publishTableState(table: Table, state: TableState): Promise<void>;
  publishLobbySnapshot(): Promise<void>;
  publishTableAndLobby(table: Table, state: TableState): Promise<void>;
  getTableSummariesSnapshot(): Promise<TableSummariesSnapshot>;
};

export function createTablePublisher(deps: TablePublisherDeps): TablePublisher {
  const getTableSummariesSnapshot = async (): Promise<TableSummariesSnapshot> => {
    const snapshot = await deps.tableQueries.listTableSummariesSnapshot();
    deps.metrics.setActiveTables(snapshot.activeTableCount);
    deps.metrics.setSeatedPlayers(snapshot.seatedPlayerCount);
    deps.metrics.setSpectatorCount(snapshot.spectatorTotal);
    return snapshot;
  };

  const publishLobbySnapshot = async (): Promise<void> => {
    const snapshot = await getTableSummariesSnapshot();
    await deps.gatewayPublisher.publishLobbyUpdate(snapshot.summaries);
  };

  const publishTableState = async (table: Table, state: TableState): Promise<void> => {
    await deps.gatewayPublisher.publishTableState(table, state);
  };

  const publishTableAndLobby = async (table: Table, state: TableState): Promise<void> => {
    const snapshotPromise = getTableSummariesSnapshot();
    await publishTableState(table, state);
    const snapshot = await snapshotPromise;
    await deps.gatewayPublisher.publishLobbyUpdate(snapshot.summaries);
  };

  return { publishTableState, publishLobbySnapshot, publishTableAndLobby, getTableSummariesSnapshot };
}

