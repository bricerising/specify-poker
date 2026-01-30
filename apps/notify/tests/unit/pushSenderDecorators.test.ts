import { describe, it, expect, vi } from 'vitest';
import type { PushSender } from '../../src/services/pushSender';

vi.mock('../../src/observability/metrics', () => ({
  recordNotificationRequested: vi.fn(),
}));

import { recordNotificationRequested } from '../../src/observability/metrics';
import { withNotificationMetrics } from '../../src/services/pushSenderDecorators';

describe('pushSenderDecorators', () => {
  it('records notification requested and delegates to push sender', async () => {
    const sendToUser = vi
      .fn<PushSender['sendToUser']>()
      .mockResolvedValue({ success: 1, failure: 0 });
    const pushSender: PushSender = { sendToUser };

    const instrumented = withNotificationMetrics(pushSender);

    await instrumented.sendToUser('u1', { title: 'T', body: 'B' });

    expect(recordNotificationRequested).toHaveBeenCalledWith('system');
    expect(sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'T', body: 'B' }));
  });
});
