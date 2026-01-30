import type WebSocket from 'ws';
import type { z } from 'zod';
import { wsClientMessageSchema } from '@specify-poker/shared';

import { parseJsonWithSchema } from './messageParsing';

export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

export function parseWsClientMessage(data: WebSocket.RawData): WsClientMessage | null {
  return parseJsonWithSchema(data, wsClientMessageSchema);
}

