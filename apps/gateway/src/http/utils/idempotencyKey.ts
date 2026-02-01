import type { Request } from 'express';
import { randomUUID } from 'crypto';

export function getIdempotencyKey(req: Request): string {
  const header = req.get('Idempotency-Key');
  const trimmed = typeof header === 'string' ? header.trim() : '';
  return trimmed.length > 0 ? trimmed : randomUUID();
}

