export type UnaryCallback<TResponse> = (err: Error | null, response: TResponse) => void;

export function unaryCall<TRequest, TResponse>(
  fn: (request: TRequest, callback: UnaryCallback<unknown>) => void,
  request: TRequest,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    fn(request, (err, response) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(response as TResponse);
    });
  });
}
