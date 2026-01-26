import type { TableState, TableSummary } from "./tableTypes";
import { asRecord, hasOwn, type UnknownRecord } from "../utils/unknown";
import {
  normalizeConfig,
  normalizeHand,
  normalizeSeat,
  normalizeSpectatorView,
  toNumber,
} from "./tableNormalization";

export function applyTablePatch(current: TableState, patch: UnknownRecord, fallback?: TableSummary): TableState {
  const config = hasOwn(patch, "config")
    ? normalizeConfig(asRecord(patch.config) ?? undefined, current.config)
    : current.config;

  const seats = hasOwn(patch, "seats") && Array.isArray(patch.seats)
    ? (patch.seats as UnknownRecord[]).map(normalizeSeat)
    : current.seats;

  const spectators = hasOwn(patch, "spectators") && Array.isArray(patch.spectators)
    ? (patch.spectators as UnknownRecord[]).map(normalizeSpectatorView)
    : current.spectators ?? [];

  const next = {
    tableId:
      typeof patch.tableId === "string"
        ? patch.tableId
        : typeof patch.table_id === "string"
          ? patch.table_id
          : current.tableId,
    name:
      typeof patch.name === "string"
        ? patch.name
        : fallback?.name && current.name === "Table"
          ? fallback.name
          : current.name,
    ownerId:
      typeof patch.ownerId === "string"
        ? patch.ownerId
        : typeof patch.owner_id === "string"
          ? patch.owner_id
          : current.ownerId,
    config,
    seats,
    spectators,
    status: current.status,
    hand: current.hand,
    button: hasOwn(patch, "button") ? toNumber(patch.button, current.button) : current.button,
    version: hasOwn(patch, "version") ? toNumber(patch.version, current.version) : current.version,
  } satisfies TableState;

  const status = hasOwn(patch, "status")
    ? String(patch.status)
    : hasOwn(patch, "hand")
      ? patch.hand
        ? "in_hand"
        : "lobby"
      : next.status;

  if (!hasOwn(patch, "hand")) {
    return { ...next, status };
  }

  if (patch.hand === null) {
    return { ...next, status, hand: null };
  }

  const handRecord = asRecord(patch.hand);
  if (!handRecord) {
    return { ...next, status };
  }

  return { ...next, status, hand: normalizeHand(handRecord, config) };
}
