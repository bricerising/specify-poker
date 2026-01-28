import { cursorStore } from '../storage/cursorStore';
import type { StreamResponse } from '../storage/streamStore';
import { streamStore } from '../storage/streamStore';
import type { Cursor } from '../domain/types';

export class StreamService {
  async getCursor(streamId: string, subscriberId: string): Promise<Cursor | null> {
    return cursorStore.getCursor(streamId, subscriberId);
  }

  async updateCursor(streamId: string, subscriberId: string, position: number): Promise<Cursor> {
    return cursorStore.upsertCursor(streamId, subscriberId, position);
  }

  async readStream(streamId: string, lastId: string): Promise<StreamResponse[] | null> {
    return streamStore.read(streamId, lastId);
  }
}

export const streamService = new StreamService();
