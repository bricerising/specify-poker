import * as dotenv from 'dotenv';
dotenv.config();

import { startObservability } from './observability';
// Start observability before other imports to ensure auto-instrumentation works
startObservability();

import { startGrpcServer } from './api/grpc/server';
import { runMigrations } from './storage/migrations';
import { connectRedis } from './storage/redisClient';
import { handMaterializer } from './jobs/handMaterializer';
import { archiver } from './jobs/archiver';

export async function main() {
  const port = parseInt(process.env.GRPC_PORT || '50054', 10);

  try {
    // Run DB migrations
    if (process.env.NODE_ENV !== 'test') {
      await runMigrations();
    }

    // Connect to Redis
    await connectRedis();

    // Start background jobs
    if (process.env.NODE_ENV !== 'test') {
      await handMaterializer.start();
      await archiver.start();
    }

    // Start gRPC server
    await startGrpcServer(port);

    console.log(`Event Service is running on port ${port}`);
  } catch (error) {
    console.error('Failed to start Event Service:', error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

if (process.env.NODE_ENV !== 'test') {
  main();
}
