import { describe, expect, it } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  mapResult,
  mapError,
  flatMap,
  unwrap,
  unwrapOr,
  tryCatch,
  tryCatchSync,
  type Result,
} from '../src/result';

describe('Result utilities', () => {
  describe('ok', () => {
    it('creates a successful result', () => {
      const result = ok(42);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it('preserves the value type', () => {
      const result = ok({ name: 'test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test');
      }
    });
  });

  describe('err', () => {
    it('creates a failed result', () => {
      const result = err('NOT_FOUND');
      expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    });

    it('preserves the error type', () => {
      const result = err({ code: 404, message: 'Not found' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(404);
      }
    });
  });

  describe('isOk', () => {
    it('returns true for ok result', () => {
      expect(isOk(ok(42))).toBe(true);
    });

    it('returns false for err result', () => {
      expect(isOk(err('error'))).toBe(false);
    });
  });

  describe('isErr', () => {
    it('returns true for err result', () => {
      expect(isErr(err('error'))).toBe(true);
    });

    it('returns false for ok result', () => {
      expect(isErr(ok(42))).toBe(false);
    });
  });

  describe('mapResult', () => {
    it('transforms the value of an ok result', () => {
      const result = mapResult(ok(5), (x) => x * 2);
      expect(result).toEqual({ ok: true, value: 10 });
    });

    it('passes through an err result unchanged', () => {
      const original = err('error');
      const result = mapResult(original, (x: number) => x * 2);
      expect(result).toBe(original);
    });
  });

  describe('mapError', () => {
    it('transforms the error of an err result', () => {
      const result = mapError(err('not_found'), (e) => e.toUpperCase());
      expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    });

    it('passes through an ok result unchanged', () => {
      const original = ok(42);
      const result = mapError(original, (e: string) => e.toUpperCase());
      expect(result).toBe(original);
    });
  });

  describe('flatMap', () => {
    it('chains ok results', () => {
      const divide = (a: number, b: number): Result<number, string> =>
        b === 0 ? err('DIVISION_BY_ZERO') : ok(a / b);

      const result = flatMap(ok(10), (x) => divide(x, 2));
      expect(result).toEqual({ ok: true, value: 5 });
    });

    it('short-circuits on err', () => {
      const divide = (a: number, b: number): Result<number, string> =>
        b === 0 ? err('DIVISION_BY_ZERO') : ok(a / b);

      const result = flatMap(err('INITIAL_ERROR' as const), (x: number) => divide(x, 2));
      expect(result).toEqual({ ok: false, error: 'INITIAL_ERROR' });
    });

    it('propagates err from the chained function', () => {
      const divide = (a: number, b: number): Result<number, string> =>
        b === 0 ? err('DIVISION_BY_ZERO') : ok(a / b);

      const result = flatMap(ok(10), (x) => divide(x, 0));
      expect(result).toEqual({ ok: false, error: 'DIVISION_BY_ZERO' });
    });
  });

  describe('unwrap', () => {
    it('returns the value for ok result', () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it('throws for err result with Error', () => {
      const error = new Error('test error');
      expect(() => unwrap(err(error))).toThrow('test error');
    });

    it('throws for err result with string', () => {
      expect(() => unwrap(err('string error'))).toThrow('string error');
    });
  });

  describe('unwrapOr', () => {
    it('returns the value for ok result', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('returns the default for err result', () => {
      expect(unwrapOr(err('error'), 0)).toBe(0);
    });
  });

  describe('tryCatch', () => {
    it('returns ok for successful async operation', async () => {
      const result = await tryCatch(async () => 42);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it('returns err for throwing async operation', async () => {
      const error = new Error('async error');
      const result = await tryCatch(async () => {
        throw error;
      });
      expect(result).toEqual({ ok: false, error });
    });

    it('maps errors when mapError is provided', async () => {
      const result = await tryCatch(
        async () => {
          throw new Error('original');
        },
        () => 'MAPPED_ERROR' as const,
      );
      expect(result).toEqual({ ok: false, error: 'MAPPED_ERROR' });
    });
  });

  describe('tryCatchSync', () => {
    it('returns ok for successful sync operation', () => {
      const result = tryCatchSync(() => 42);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it('returns err for throwing sync operation', () => {
      const error = new Error('sync error');
      const result = tryCatchSync(() => {
        throw error;
      });
      expect(result).toEqual({ ok: false, error });
    });

    it('maps errors when mapError is provided', () => {
      const result = tryCatchSync(
        () => {
          throw new Error('original');
        },
        () => 'MAPPED_ERROR' as const,
      );
      expect(result).toEqual({ ok: false, error: 'MAPPED_ERROR' });
    });
  });

  describe('type narrowing', () => {
    it('allows type-safe access after ok check', () => {
      const result: Result<{ name: string }, string> = ok({ name: 'test' });
      if (result.ok) {
        // TypeScript should allow this without error
        const name: string = result.value.name;
        expect(name).toBe('test');
      }
    });

    it('allows type-safe access after err check', () => {
      const result: Result<number, { code: number }> = err({ code: 404 });
      if (!result.ok) {
        // TypeScript should allow this without error
        const code: number = result.error.code;
        expect(code).toBe(404);
      }
    });
  });
});
