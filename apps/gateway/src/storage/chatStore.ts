import { withRedisClient } from './redisClient';
import { safeJsonParseRecord } from '../utils/json';

const CHAT_HISTORY_KEY = 'gateway:chat:history';
const MAX_HISTORY = 100;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  ts: string;
}

export async function saveChatMessage(tableId: string, message: ChatMessage) {
  const key = `${CHAT_HISTORY_KEY}:${tableId}`;
  await withRedisClient(
    async (redis) => {
      await redis.lPush(key, JSON.stringify(message));
      await redis.lTrim(key, 0, MAX_HISTORY - 1);
      await redis.pExpire(key, RETENTION_MS);
    },
    {
      fallback: undefined,
      logMessage: 'chat.save.failed',
      context: { tableId },
    },
  );
}

export async function getChatHistory(tableId: string): Promise<ChatMessage[]> {
  const key = `${CHAT_HISTORY_KEY}:${tableId}`;
  return await withRedisClient(
    async (redis) => {
      const raw = await redis.lRange(key, 0, -1);
      return raw
        .map((entry) => {
          const record = safeJsonParseRecord(entry);
          if (!record) {
            return null;
          }

          const username = typeof record.username === 'string' ? record.username : '';
          const normalizedUsername = username.trim();
          return {
            id: typeof record.id === 'string' ? record.id : '',
            userId: typeof record.userId === 'string' ? record.userId : '',
            username: normalizedUsername.length > 0 ? normalizedUsername : 'Unknown',
            text: typeof record.text === 'string' ? record.text : '',
            ts: typeof record.ts === 'string' ? record.ts : '',
          } satisfies ChatMessage;
        })
        .filter((entry): entry is ChatMessage =>
          Boolean(entry && entry.id && entry.userId && entry.text && entry.ts),
        )
        .reverse();
    },
    {
      fallback: [],
      logMessage: 'chat.history.failed',
      context: { tableId },
    },
  );
}
