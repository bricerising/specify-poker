import { getRedisClient } from "./redisClient";
import logger from "../observability/logger";

const CHAT_HISTORY_KEY = "gateway:chat:history";
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
  const redis = await getRedisClient();
  if (!redis) return;

  const key = `${CHAT_HISTORY_KEY}:${tableId}`;
  try {
    await redis.lPush(key, JSON.stringify(message));
    await redis.lTrim(key, 0, MAX_HISTORY - 1);
    await redis.pExpire(key, RETENTION_MS);
  } catch (err) {
    logger.error({ err, tableId }, "Failed to save chat message to Redis");
  }
}

export async function getChatHistory(tableId: string): Promise<ChatMessage[]> {
  const redis = await getRedisClient();
  if (!redis) return [];

  const key = `${CHAT_HISTORY_KEY}:${tableId}`;
  try {
    const raw = await redis.lRange(key, 0, -1);
    return raw
      .map((entry) => {
        const parsed: unknown = JSON.parse(entry);
        if (!parsed || typeof parsed !== "object") {
          return null;
        }
        const record = parsed as Record<string, unknown>;
        const username = typeof record.username === "string" ? record.username : "";
        const normalizedUsername = username.trim();
        return {
          id: typeof record.id === "string" ? record.id : "",
          userId: typeof record.userId === "string" ? record.userId : "",
          username: normalizedUsername.length > 0 ? normalizedUsername : "Unknown",
          text: typeof record.text === "string" ? record.text : "",
          ts: typeof record.ts === "string" ? record.ts : "",
        } satisfies ChatMessage;
      })
      .filter((entry): entry is ChatMessage => Boolean(entry && entry.id && entry.userId && entry.text && entry.ts))
      .reverse();
  } catch (err) {
    logger.error({ err, tableId }, "Failed to get chat history from Redis");
    return [];
  }
}
