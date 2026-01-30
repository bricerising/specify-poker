import { describe, it, expect, vi } from 'vitest';
import { createSubject } from '../index';

describe('createSubject', () => {
  it('notifies all subscribers', async () => {
    const subject = createSubject<string>();
    const observer1 = vi.fn();
    const observer2 = vi.fn();

    subject.subscribe(observer1);
    subject.subscribe(observer2);

    await subject.notify('test');

    expect(observer1).toHaveBeenCalledWith('test');
    expect(observer2).toHaveBeenCalledWith('test');
  });

  it('allows unsubscription', async () => {
    const subject = createSubject<string>();
    const observer = vi.fn();

    const unsub = subject.subscribe(observer);
    await subject.notify('first');

    unsub();
    await subject.notify('second');

    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith('first');
  });

  it('awaits async observers', async () => {
    const subject = createSubject<string>();
    const order: number[] = [];

    subject.subscribe(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(1);
    });
    subject.subscribe(() => {
      order.push(2);
    });

    await subject.notify('test');

    expect(order).toContain(1);
    expect(order).toContain(2);
  });

  it('catches observer errors and reports via onError', async () => {
    const onError = vi.fn();
    const subject = createSubject<string>({ onError });
    const error = new Error('test error');
    const goodObserver = vi.fn();

    subject.subscribe(() => {
      throw error;
    });
    subject.subscribe(goodObserver);

    await subject.notify('test');

    expect(onError).toHaveBeenCalledWith(error, 'test');
    expect(goodObserver).toHaveBeenCalledWith('test');
  });

  it('tracks subscriber count via size()', () => {
    const subject = createSubject<string>();

    expect(subject.size()).toBe(0);

    const unsub1 = subject.subscribe(() => {});
    expect(subject.size()).toBe(1);

    const unsub2 = subject.subscribe(() => {});
    expect(subject.size()).toBe(2);

    unsub1();
    expect(subject.size()).toBe(1);

    unsub2();
    expect(subject.size()).toBe(0);
  });

  it('does not notify unsubscribed observers', async () => {
    const subject = createSubject<number>();
    const observer1 = vi.fn();
    const observer2 = vi.fn();

    const unsub1 = subject.subscribe(observer1);
    subject.subscribe(observer2);

    unsub1();
    await subject.notify(42);

    expect(observer1).not.toHaveBeenCalled();
    expect(observer2).toHaveBeenCalledWith(42);
  });
});
