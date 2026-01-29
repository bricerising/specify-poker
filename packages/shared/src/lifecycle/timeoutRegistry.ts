export type TimeoutHandle = ReturnType<typeof setTimeout>;

export class TimeoutRegistry<Key> {
  private readonly timeouts = new Map<Key, TimeoutHandle>();

  has(key: Key): boolean {
    return this.timeouts.has(key);
  }

  get(key: Key): TimeoutHandle | undefined {
    return this.timeouts.get(key);
  }

  set(key: Key, timeout: TimeoutHandle): void {
    this.delete(key);
    this.timeouts.set(key, timeout);
  }

  delete(key: Key): boolean {
    const existing = this.timeouts.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    return this.timeouts.delete(key);
  }

  clear(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }

  values(): IterableIterator<TimeoutHandle> {
    return this.timeouts.values();
  }

  get size(): number {
    return this.timeouts.size;
  }
}

