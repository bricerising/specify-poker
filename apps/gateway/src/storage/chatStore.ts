import { getRedisClient } from "./redisClient";
import logger from "../observability/logger";

const CHAT_HISTORY_KEY = "gateway:chat:history";
const MAX_HISTORY = 100;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
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
    return raw.map(r => JSON.parse(r)).reverse();
  } catch (err) {
    logger.error({ err, tableId }, "Failed to get chat history from Redis");
    return [];
  }
}
