export class InvalidArgumentError extends Error {
  override readonly name = 'InvalidArgumentError';
}

export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';
}

export class PermissionDeniedError extends Error {
  override readonly name = 'PermissionDeniedError';
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// Typed Error Variants (for Result-based error handling)
// ============================================================================

/** Event validation error variants */
export type EventValidationError =
  | { type: 'MissingType' }
  | { type: 'UnknownType'; eventType: string }
  | { type: 'MissingTableId' }
  | { type: 'InvalidPayload' }
  | { type: 'MissingHandId'; eventType: string }
  | { type: 'InvalidUserId' }
  | { type: 'InvalidSeatId' }
  | { type: 'InvalidIdempotencyKey' };

/** Get a human-readable message for an event validation error */
export function eventValidationErrorMessage(error: EventValidationError): string {
  switch (error.type) {
    case 'MissingType':
      return 'Event type is required';
    case 'UnknownType':
      return `Unknown event type: ${error.eventType}`;
    case 'MissingTableId':
      return 'Table ID is required';
    case 'InvalidPayload':
      return 'Payload must be an object';
    case 'MissingHandId':
      return `handId is required for event type ${error.eventType}`;
    case 'InvalidUserId':
      return 'userId must be a non-empty string when provided';
    case 'InvalidSeatId':
      return 'seatId must be a number when provided';
    case 'InvalidIdempotencyKey':
      return 'idempotencyKey must be a non-empty string when provided';
  }
}
