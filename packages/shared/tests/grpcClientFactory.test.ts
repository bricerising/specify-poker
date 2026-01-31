import { describe, expect, it, vi } from 'vitest';
import {
  createGrpcServiceClientFactory,
  createGrpcServiceClientFactoryBuilder,
} from '../src/grpc/clientFactory';

describe('createGrpcServiceClientFactory', () => {
  it('loads the proto once and constructs clients', () => {
    const loadSync = vi.fn(() => ({}));

    class ExampleServiceClient {
      constructor(
        public address: string,
        public credentials: unknown,
      ) {}
    }

    const loadPackageDefinition = vi.fn(() => ({
      example: { ExampleService: ExampleServiceClient },
    }));

    type ExampleProto = {
      example: {
        ExampleService: new (address: string, credentials: unknown) => ExampleServiceClient;
      };
    };

    const factory = createGrpcServiceClientFactory<ExampleProto, ExampleServiceClient>({
      grpc: { loadPackageDefinition },
      protoLoader: { loadSync },
      protoPath: 'example.proto',
      protoLoaderOptions: { keepCase: true },
      loadProto: (loaded) => loaded as ExampleProto,
      getServiceConstructor: (proto) => proto.example.ExampleService,
    });

    const client1 = factory.createClient({
      address: 'localhost:1234',
      credentials: { token: 'a' },
    });
    const client2 = factory.createClient({
      address: 'localhost:5678',
      credentials: { token: 'b' },
    });

    expect(loadSync).toHaveBeenCalledTimes(1);
    expect(loadPackageDefinition).toHaveBeenCalledTimes(1);
    expect(client1).toBeInstanceOf(ExampleServiceClient);
    expect(client1.address).toBe('localhost:1234');
    expect(client2.address).toBe('localhost:5678');
  });
});

describe('createGrpcServiceClientFactoryBuilder', () => {
  it('creates service factories using shared defaults', () => {
    const loadSync = vi.fn(() => ({}));

    class ExampleServiceClient {
      constructor(
        public address: string,
        public credentials: unknown,
      ) {}
    }

    const loadPackageDefinition = vi.fn(() => ({
      example: { ExampleService: ExampleServiceClient },
    }));

    type ExampleProto = {
      example: {
        ExampleService: new (address: string, credentials: unknown) => ExampleServiceClient;
      };
    };

    const builder = createGrpcServiceClientFactoryBuilder({
      grpc: { loadPackageDefinition },
      protoLoader: { loadSync },
      protoLoaderOptions: { keepCase: true },
    });

    const factory = builder.service<ExampleProto, ExampleServiceClient>({
      protoPath: 'example.proto',
      getServiceConstructor: (proto) => proto.example.ExampleService,
    });

    factory.createClient({
      address: 'localhost:1234',
      credentials: { token: 'a' },
    });

    expect(loadSync).toHaveBeenCalledWith('example.proto', { keepCase: true });
    expect(loadPackageDefinition).toHaveBeenCalledTimes(1);
  });

  it('supports per-service protoLoaderOptions overrides', () => {
    const loadSync = vi.fn(() => ({}));

    class ExampleServiceClient {
      constructor(
        public address: string,
        public credentials: unknown,
      ) {}
    }

    const loadPackageDefinition = vi.fn(() => ({
      example: { ExampleService: ExampleServiceClient },
    }));

    type ExampleProto = {
      example: {
        ExampleService: new (address: string, credentials: unknown) => ExampleServiceClient;
      };
    };

    const builder = createGrpcServiceClientFactoryBuilder({
      grpc: { loadPackageDefinition },
      protoLoader: { loadSync },
      protoLoaderOptions: { keepCase: true },
    });

    const factory = builder.service<ExampleProto, ExampleServiceClient>({
      protoPath: 'example.proto',
      protoLoaderOptions: { keepCase: false },
      getServiceConstructor: (proto) => proto.example.ExampleService,
    });

    factory.createClient({
      address: 'localhost:1234',
      credentials: { token: 'a' },
    });

    expect(loadSync).toHaveBeenCalledWith('example.proto', { keepCase: false });
    expect(loadPackageDefinition).toHaveBeenCalledTimes(1);
  });
});
