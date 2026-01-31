import { describe, expect, it, vi } from 'vitest';

import { runServiceMain, runServiceMainIfDirectRun } from '../src/lifecycle/serviceRunner';

type Listener = (...args: unknown[]) => void;

class FakeProcess {
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  emit(event: string, ...args: unknown[]): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(...args);
    }
  }
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('runServiceMain', () => {
  it('runs main and does not exit on success', async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {});
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMain({ main, shutdown, exit, process: proc });

    await nextTick();

    expect(main).toHaveBeenCalledTimes(1);
    expect(shutdown).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('shuts down and exits on main error', async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {
      throw new Error('boom');
    });
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMain({ main, shutdown, exit, process: proc, fatalExitCode: 9 });

    await nextTick();
    await nextTick();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(9);
  });

  it('logs shutdown failure and still exits', async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {
      throw new Error('boom');
    });
    const shutdown = vi.fn(async () => {
      throw new Error('shutdown boom');
    });
    const exit = vi.fn();
    const logger = { error: vi.fn() };

    runServiceMain({ main, shutdown, exit, process: proc, fatalExitCode: 9, logger });

    await nextTick();
    await nextTick();
    await nextTick();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'service.failed',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'service.shutdown.failed',
    );
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(9);
  });

  it('is idempotent across multiple exit signals', async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {
      await new Promise(() => {});
    });
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMain({ main, shutdown, exit, process: proc });

    proc.emit('SIGINT');
    proc.emit('SIGTERM');

    await nextTick();
    await nextTick();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe('runServiceMainIfDirectRun', () => {
  it('does not run when not direct run', async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {});
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMainIfDirectRun({
      main,
      shutdown,
      exit,
      process: proc,
      isDirectRun: () => false,
      isTestEnv: () => false,
    });

    await nextTick();

    expect(main).not.toHaveBeenCalled();
    expect(shutdown).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('does not run in test env', async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {});
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMainIfDirectRun({
      main,
      shutdown,
      exit,
      process: proc,
      isDirectRun: () => true,
      isTestEnv: () => true,
    });

    await nextTick();

    expect(main).not.toHaveBeenCalled();
    expect(shutdown).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('runs main when direct run and not test env', async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {});
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMainIfDirectRun({
      main,
      shutdown,
      exit,
      process: proc,
      isDirectRun: () => true,
      isTestEnv: () => false,
    });

    await nextTick();

    expect(main).toHaveBeenCalledTimes(1);
    expect(shutdown).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
