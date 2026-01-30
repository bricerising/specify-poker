export class AppError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {}

export class ConflictError extends AppError {}

export class NotFoundError extends AppError {}

export function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const message = typeof error === 'string' ? error : 'Unknown error';
  return new Error(message, { cause: error });
}

// ============================================================================
// Typed Error Variants (for Result-based error handling)
// ============================================================================

/** Profile update error variants */
export type UpdateProfileError =
  | { type: 'NotFound' }
  | { type: 'NicknameConflict'; nickname: string }
  | { type: 'InvalidAvatarUrl'; url: string };

/** Friend operation error variants */
export type AddFriendError = { type: 'CannotAddSelf' };
