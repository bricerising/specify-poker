import type { Table, TableState, TableSummary } from '../../domain/types';

type TableStoreLike = {
  list(): Promise<string[]>;
  get(tableId: string): Promise<Table | null>;
};

type TableStateStoreLike = {
  get(tableId: string): Promise<TableState | null>;
};

export type TableSummariesSnapshot = {
  summaries: TableSummary[];
  activeTableCount: number;
  seatedPlayerCount: number;
  spectatorTotal: number;
};

export type TableQueries = {
  loadTableAndState(tableId: string): Promise<{ table: Table; state: TableState } | null>;
  listTableSummariesSnapshot(): Promise<TableSummariesSnapshot>;
};

export function createTableQueries(options: {
  tableStore: TableStoreLike;
  tableStateStore: TableStateStoreLike;
}): TableQueries {
  const { tableStore, tableStateStore } = options;

  const loadTableAndState = async (
    tableId: string,
  ): Promise<{ table: Table; state: TableState } | null> => {
    const [table, state] = await Promise.all([
      tableStore.get(tableId),
      tableStateStore.get(tableId),
    ]);
    if (!table || !state) {
      return null;
    }
    return { table, state };
  };

  const listTableSummariesSnapshot = async (): Promise<TableSummariesSnapshot> => {
    const tableIds = await tableStore.list();

    const loaded = await Promise.all(
      tableIds.map(async (tableId) => {
        const [table, state] = await Promise.all([
          tableStore.get(tableId),
          tableStateStore.get(tableId),
        ]);
        if (!table || !state) {
          return null;
        }

        const occupiedSeatIds = state.seats
          .filter((seat) => seat.status !== 'EMPTY')
          .map((seat) => seat.seatId);
        const seatedPlayerCount = state.seats.filter(
          (seat) => Boolean(seat.userId) && seat.status !== 'EMPTY',
        ).length;
        const spectatorCount = state.spectators.length;
        const inProgress = state.hand !== null;

        const summary: TableSummary = {
          tableId: table.tableId,
          name: table.name,
          ownerId: table.ownerId,
          config: table.config,
          seatsTaken: occupiedSeatIds.length,
          occupiedSeatIds,
          inProgress,
          spectatorCount,
        };

        return {
          summary,
          activeTableCount: inProgress ? 1 : 0,
          seatedPlayerCount,
          spectatorCount,
        };
      }),
    );

    const summaries: TableSummary[] = [];
    let activeTableCount = 0;
    let seatedPlayerCount = 0;
    let spectatorTotal = 0;

    for (const entry of loaded) {
      if (!entry) {
        continue;
      }

      summaries.push(entry.summary);
      activeTableCount += entry.activeTableCount;
      seatedPlayerCount += entry.seatedPlayerCount;
      spectatorTotal += entry.spectatorCount;
    }

    return { summaries, activeTableCount, seatedPlayerCount, spectatorTotal };
  };

  return { loadTableAndState, listTableSummariesSnapshot };
}
