type GrpcClientLike = {
  close?: () => void;
  getChannel?: () => unknown;
};

type GrpcChannelLike = {
  close?: () => void;
};

/**
 * Best-effort close for `@grpc/grpc-js` client instances.
 *
 * We intentionally use duck-typing here because many call sites type service clients
 * as RPC-method-only interfaces (i.e. without `close()`), even though the concrete
 * grpc client instance supports closing.
 */
export function closeGrpcClient(client: unknown): void {
  if (typeof client !== 'object' || client === null) {
    return;
  }

  const { close, getChannel } = client as GrpcClientLike;
  if (typeof close === 'function') {
    close.call(client);
    return;
  }

  if (typeof getChannel !== 'function') {
    return;
  }

  const channel = getChannel.call(client) as GrpcChannelLike;
  if (typeof channel?.close === 'function') {
    channel.close.call(channel);
  }
}

