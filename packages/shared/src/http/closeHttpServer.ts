type CloseCallback = (err?: Error) => void;

type HttpServerLike = {
  close(callback: CloseCallback): unknown;
};

function isServerNotRunningError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ERR_SERVER_NOT_RUNNING'
  );
}

export async function closeHttpServer(server: HttpServerLike): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    try {
      server.close((err?: Error) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    } catch (error: unknown) {
      if (isServerNotRunningError(error)) {
        resolve();
        return;
      }
      reject(error);
    }
  });
}
