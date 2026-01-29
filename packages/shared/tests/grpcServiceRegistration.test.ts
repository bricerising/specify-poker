import { describe, expect, it, vi } from 'vitest';

import { addGrpcService, GrpcServiceRegistrationError } from '../src/grpc/serviceRegistration';

describe('addGrpcService', () => {
  it('registers when handlers match protobuf method names', () => {
    const server = { addService: vi.fn() };
    const service = {
      GetProfile: { originalName: 'getProfile' },
      GetFriends: { originalName: 'getFriends' },
    };

    const handlers = {
      GetProfile: vi.fn(),
      GetFriends: vi.fn(),
    };

    addGrpcService({ server, service, handlers, serviceName: 'PlayerService' });

    expect(server.addService).toHaveBeenCalledWith(service, handlers);
  });

  it('registers when handlers match method originalName', () => {
    const server = { addService: vi.fn() };
    const service = {
      PublishEvent: { originalName: 'publishEvent' },
      PublishEvents: { originalName: 'publishEvents' },
    };

    const handlers = {
      publishEvent: vi.fn(),
      publishEvents: vi.fn(),
    };

    addGrpcService({ server, service, handlers, serviceName: 'EventService' });

    expect(server.addService).toHaveBeenCalledWith(service, handlers);
  });

  it('throws when required methods are missing', () => {
    const server = { addService: vi.fn() };
    const service = {
      RegisterSubscription: { originalName: 'registerSubscription' },
      UnregisterSubscription: { originalName: 'unregisterSubscription' },
    };

    expect(() =>
      addGrpcService({
        server,
        service,
        handlers: { registerSubscription: vi.fn() },
        serviceName: 'NotifyService',
      }),
    ).toThrow(GrpcServiceRegistrationError);

    expect(server.addService).not.toHaveBeenCalled();
  });
});

