import { api } from './apiClient';
import type { ApiClient } from './apiClient';
import { createJsonApiClient } from './jsonApiClient';
import { normalizeTableSummary } from '../state/tableNormalization';
import type { TableSummary } from '../state/tableTypes';
import { asRecord } from '../utils/unknown';

export interface CreateTableInput {
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  startingStack: number;
}

export type LobbyApi = {
  listTables(): Promise<TableSummary[]>;
  createTable(input: CreateTableInput): Promise<TableSummary>;
};

function decodeTableSummary(payload: unknown): TableSummary {
  const record = asRecord(payload);
  if (!record) {
    throw new Error('Invalid table response');
  }
  return normalizeTableSummary(record);
}

function decodeTableSummaries(payload: unknown): TableSummary[] {
  if (!Array.isArray(payload)) {
    throw new Error('Invalid tables response');
  }
  return payload.map(decodeTableSummary);
}

export function createLobbyApi(client: ApiClient): LobbyApi {
  const jsonClient = createJsonApiClient(client);

  const listTables: LobbyApi['listTables'] = () => {
    return jsonClient.requestDecoded('/api/tables', decodeTableSummaries);
  };

  const createTable: LobbyApi['createTable'] = (input) => {
    return jsonClient.requestDecoded('/api/tables', decodeTableSummary, {
      method: 'POST',
      json: {
        name: input.name,
        config: {
          smallBlind: input.smallBlind,
          bigBlind: input.bigBlind,
          maxPlayers: input.maxPlayers,
          startingStack: input.startingStack,
        },
      },
    });
  };

  return { listTables, createTable };
}

export const lobbyApi = createLobbyApi(api);

export const listTables: LobbyApi['listTables'] = (...args) => lobbyApi.listTables(...args);
export const createTable: LobbyApi['createTable'] = (...args) => lobbyApi.createTable(...args);
