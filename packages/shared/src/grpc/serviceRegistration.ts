type GrpcServerLike = {
  addService(service: unknown, implementation: unknown): void;
};

type GrpcMethodDefinitionLike = {
  originalName?: unknown;
};

type GrpcServiceDefinitionLike = Record<string, GrpcMethodDefinitionLike>;

export class GrpcServiceRegistrationError extends Error {
  override name = 'GrpcServiceRegistrationError';
  readonly serviceName?: string;
  readonly missingMethods: readonly string[];

  constructor(serviceName: string | undefined, missingMethods: readonly string[]) {
    const suffix = serviceName ? ` for ${serviceName}` : '';
    super(`Missing gRPC handlers${suffix}: ${missingMethods.join(', ')}`);
    this.serviceName = serviceName;
    this.missingMethods = missingMethods;
  }
}

function getOriginalName(methodDefinition: unknown): string | undefined {
  if (typeof methodDefinition !== 'object' || methodDefinition === null) {
    return undefined;
  }

  const originalName = (methodDefinition as GrpcMethodDefinitionLike).originalName;
  return typeof originalName === 'string' ? originalName : undefined;
}

/**
 * Facade around `server.addService(...)` that validates the handler map.
 *
 * grpc-js supports resolving handlers by either:
 * - the protobuf method name (e.g. `GetProfile`)
 * - the method's `originalName` (e.g. `getProfile`)
 */
export function addGrpcService<THandlers extends object>(options: {
  server: GrpcServerLike;
  service: GrpcServiceDefinitionLike;
  handlers: THandlers;
  serviceName?: string;
}): void {
  const handlerByName = options.handlers as unknown as Record<string, unknown>;

  const missingMethods: string[] = [];
  for (const [methodName, methodDefinition] of Object.entries(options.service)) {
    if (typeof methodDefinition !== 'object' || methodDefinition === null) {
      continue;
    }

    const direct = handlerByName[methodName];
    if (typeof direct === 'function') {
      continue;
    }

    const originalName = getOriginalName(methodDefinition);
    const original = originalName ? handlerByName[originalName] : undefined;
    if (typeof original === 'function') {
      continue;
    }

    missingMethods.push(methodName);
  }

  if (missingMethods.length > 0) {
    throw new GrpcServiceRegistrationError(options.serviceName, missingMethods);
  }

  options.server.addService(options.service, options.handlers);
}
