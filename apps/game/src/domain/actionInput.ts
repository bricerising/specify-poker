import { err, ok, type Result } from '@specify-poker/shared';

import { isActionType, type ActionInput, type ActionType } from './types';

type AmountRequiredActionType = Extract<ActionType, 'BET' | 'RAISE' | 'POST_BLIND'>;

export type ParseActionInputError =
  | { readonly type: 'ILLEGAL_ACTION'; readonly actionType: string }
  | { readonly type: 'MISSING_AMOUNT'; readonly actionType: AmountRequiredActionType }
  | { readonly type: 'INVALID_AMOUNT'; readonly actionType: AmountRequiredActionType };

type ActionInputParser = (amount: unknown) => Result<ActionInput, ParseActionInputError>;

function parseAmount(value: unknown): Result<number, 'MISSING_AMOUNT' | 'INVALID_AMOUNT'> {
  if (value === undefined || value === null) {
    return err('MISSING_AMOUNT');
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? ok(value) : err('INVALID_AMOUNT');
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? ok(parsed) : err('INVALID_AMOUNT');
  }

  return err('INVALID_AMOUNT');
}

const ACTION_INPUT_PARSERS: Readonly<Record<ActionType, ActionInputParser>> = {
  POST_BLIND: (amount) => {
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      return err({
        type: parsed.error,
        actionType: 'POST_BLIND',
      });
    }
    return ok({ type: 'POST_BLIND', amount: parsed.value });
  },
  FOLD: () => ok({ type: 'FOLD' }),
  CHECK: () => ok({ type: 'CHECK' }),
  CALL: () => ok({ type: 'CALL' }),
  BET: (amount) => {
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      return err({
        type: parsed.error,
        actionType: 'BET',
      });
    }
    return ok({ type: 'BET', amount: parsed.value });
  },
  RAISE: (amount) => {
    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      return err({
        type: parsed.error,
        actionType: 'RAISE',
      });
    }
    return ok({ type: 'RAISE', amount: parsed.value });
  },
  ALL_IN: () => ok({ type: 'ALL_IN' }),
};

export function parseActionInput(params: {
  actionType: unknown;
  amount?: unknown;
}): Result<ActionInput, ParseActionInputError> {
  const rawType = params.actionType;
  const normalizedType =
    typeof rawType === 'string'
      ? rawType.trim().toUpperCase()
      : String(rawType ?? '')
          .trim()
          .toUpperCase();

  if (!isActionType(normalizedType)) {
    return err({
      type: 'ILLEGAL_ACTION',
      actionType: normalizedType,
    });
  }

  return ACTION_INPUT_PARSERS[normalizedType](params.amount);
}
