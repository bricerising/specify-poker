export type Middleware<TInput, TOutput> = (input: TInput, next: (input: TInput) => TOutput) => TOutput;

export function composeMiddlewares<TInput, TOutput>(
  middlewares: readonly Middleware<TInput, TOutput>[],
  terminal: (input: TInput) => TOutput,
): (input: TInput) => TOutput {
  return middlewares.reduceRight<(input: TInput) => TOutput>((next, middleware) => {
    return (input) => middleware(input, next);
  }, terminal);
}

