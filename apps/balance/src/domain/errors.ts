export type AccountErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_AMOUNT'
  | 'UPDATE_FAILED'
  | 'VERSION_CONFLICT';

export const ACCOUNT_ERROR_CODES = [
  'ACCOUNT_NOT_FOUND',
  'INSUFFICIENT_BALANCE',
  'INVALID_AMOUNT',
  'UPDATE_FAILED',
  'VERSION_CONFLICT',
] as const satisfies readonly AccountErrorCode[];

export type ReservationErrorCode =
  | 'RESERVATION_EXPIRED'
  | 'RESERVATION_NOT_FOUND'
  | 'RESERVATION_NOT_HELD'
  | 'ALREADY_COMMITTED';

export const RESERVATION_ERROR_CODES = [
  'RESERVATION_EXPIRED',
  'RESERVATION_NOT_FOUND',
  'RESERVATION_NOT_HELD',
  'ALREADY_COMMITTED',
] as const satisfies readonly ReservationErrorCode[];

export type PotErrorCode = 'POT_NOT_FOUND' | 'POT_NOT_ACTIVE';

export const POT_ERROR_CODES = [
  'POT_NOT_FOUND',
  'POT_NOT_ACTIVE',
] as const satisfies readonly PotErrorCode[];

export type BalanceServiceErrorCode = AccountErrorCode | ReservationErrorCode | PotErrorCode;

export const BALANCE_SERVICE_ERROR_CODES = [
  ...ACCOUNT_ERROR_CODES,
  ...RESERVATION_ERROR_CODES,
  ...POT_ERROR_CODES,
] as const satisfies readonly BalanceServiceErrorCode[];
