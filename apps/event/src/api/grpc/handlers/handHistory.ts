import type {
  GetHandHistoryRequest,
  GetHandRecordRequest,
  GetHandsForUserRequest,
  ProtoGetHandHistoryResponse,
  ProtoGetHandsForUserResponse,
  ProtoHandRecord,
} from '../types';
import { unary } from '../unary';
import { NotFoundError } from '../../../errors';
import type { EventServiceFacade } from '../../../services/facade';
import {
  coerceNonNegativeInt,
  coercePositiveInt,
  optionalNonEmptyString,
  requireNonEmptyString,
} from './decoders';
import { mapHandRecordToProto } from './mappers';

export type CreateHandHistoryHandlersOptions = {
  services: EventServiceFacade;
};

export function createHandHistoryHandlers({ services }: CreateHandHistoryHandlersOptions) {
  return {
    getHandRecord: unary<GetHandRecordRequest, ProtoHandRecord>('GetHandRecord', async (request) => {
      const handId = requireNonEmptyString(request.handId, 'handId');
      const record = await services.handRecords.getHandRecord(
        handId,
        optionalNonEmptyString(request.requesterId),
      );
      if (!record) {
        throw new NotFoundError('Hand record not found');
      }
      return mapHandRecordToProto(record);
    }),

    getHandHistory: unary<GetHandHistoryRequest, ProtoGetHandHistoryResponse>(
      'GetHandHistory',
      async (request) => {
        const tableId = requireNonEmptyString(request.tableId, 'tableId');
        const limit = coercePositiveInt(request.limit, 20);
        const offset = coerceNonNegativeInt(request.offset, 0);

        const result = await services.handRecords.getHandHistory(
          tableId,
          limit,
          offset,
          optionalNonEmptyString(request.requesterId),
        );

        return {
          hands: result.hands.map(mapHandRecordToProto),
          total: result.total,
        };
      },
    ),

    getHandsForUser: unary<GetHandsForUserRequest, ProtoGetHandsForUserResponse>(
      'GetHandsForUser',
      async (request) => {
        const userId = requireNonEmptyString(request.userId, 'userId');
        const limit = coercePositiveInt(request.limit, 20);
        const offset = coerceNonNegativeInt(request.offset, 0);

        const result = await services.handRecords.getHandsForUser(userId, limit, offset);
        return {
          hands: result.hands.map(mapHandRecordToProto),
          total: result.total,
        };
      },
    ),
  };
}
