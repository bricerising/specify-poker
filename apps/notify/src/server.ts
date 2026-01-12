import * as dotenv from 'dotenv';
dotenv.config();

import { startObservability } from './observability';
// Start observability before other imports to ensure auto-instrumentation works
startObservability();

import { startGrpcServer } from './api/grpc/server';
import { SubscriptionStore } from './storage/subscriptionStore';
import { PushService } from './services/pushService';
import { EventConsumer } from './services/eventConsumer';

export async function main() {
  const port = parseInt(process.env.GRPC_PORT || '50055', 10);

  const subscriptionStore = new SubscriptionStore();
  const pushService = new PushService(subscriptionStore);
  const eventConsumer = new EventConsumer(pushService);

  try {
    // Start gRPC server
    await startGrpcServer(port, subscriptionStore, pushService);

    // Start event consumer
    await eventConsumer.start();

    console.log(`Notify Service is running on port ${port}`);
    return { subscriptionStore, pushService, eventConsumer };
  } catch (error) {
    console.error('Failed to start Notify Service:', error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

if (process.env.NODE_ENV !== 'test') {
  main();
}
