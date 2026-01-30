import { cursorStore } from '../storage/cursorStore';
import type { StreamResponse } from '../storage/streamStore';
import { streamStore } from '../storage/streamStore';
import type { Cursor } from '../domain/types';

export type StreamServiceDependencies = {
  cursorStore: Pick<typeof cursorStore, 'getCursor' | 'upsertCursor'>;
  streamStore: Pick<typeof streamStore, 'read'>;
};

export class StreamService {
  constructor(
    private readonly deps: StreamServiceDependencies = { cursorStore, streamStore },
  ) {}

  async getCursor(streamId: string, subscriberId: string): Promise<Cursor | null> {
    return this.deps.cursorStore.getCursor(streamId, subscriberId);
  }

  async updateCursor(streamId: string, subscriberId: string, position: number): Promise<Cursor> {
    return this.deps.cursorStore.upsertCursor(streamId, subscriberId, position);
  }

  async readStream(streamId: string, lastId: string): Promise<StreamResponse[] | null> {
    return this.deps.streamStore.read(streamId, lastId);
  }
}

export const streamService = new StreamService();
