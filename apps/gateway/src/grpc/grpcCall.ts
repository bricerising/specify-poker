type UnaryCallback<T> = (err: Error | null, response: T) => void;

export function grpcCall<TRequest, TResponse>(
  method: (request: TRequest, callback: UnaryCallback<TResponse>) => void,
  request: TRequest,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    method(request, (err, response) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(response);
    });
  });
}

