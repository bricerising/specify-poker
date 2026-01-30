export class KeyedTaskQueue {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const safePrevious = previous.catch(() => undefined);

    let release: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const tail = safePrevious.then(() => current);
    this.tails.set(key, tail);

    await safePrevious;

    try {
      return await task();
    } finally {
      release!();
      void tail.finally(() => {
        if (this.tails.get(key) === tail) {
          this.tails.delete(key);
        }
      });
    }
  }

  clear(): void {
    this.tails.clear();
  }
}

