import redisClient from "../../storage/redisClient";
import { Table, TableState, TableSummary } from "../../domain/types";
import { buildTableStateView } from "./tableViewBuilder";

const WS_PUBSUB_CHANNEL = "gateway:ws:events";

export class GatewayWsPublisher {
  async publishTableState(table: Table, state: TableState) {
    const payload = { type: "TableSnapshot", tableState: buildTableStateView(table, state) };
    await redisClient.publish(
      WS_PUBSUB_CHANNEL,
      JSON.stringify({ channel: "table", tableId: table.tableId, payload, sourceId: "game-service" }),
    );
  }

  async publishLobbyUpdate(tables: TableSummary[]) {
    await redisClient.publish(
      WS_PUBSUB_CHANNEL,
      JSON.stringify({
        channel: "lobby",
        tableId: "lobby",
        payload: { type: "LobbyTablesUpdated", tables },
        sourceId: "game-service",
      }),
    );
  }
}

export const gatewayWsPublisher = new GatewayWsPublisher();

