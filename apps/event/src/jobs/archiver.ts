import { createPeriodicTask, type PeriodicTask } from '@specify-poker/shared';

import logger from '../observability/logger';

const ONE_HOUR_MS = 3600 * 1000;

export class Archiver {
  private isRunning = false;
  private task: PeriodicTask | null = null;

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('Archiver started');
    // Periodically check for old data to archive
    this.task?.stop();
    this.task = createPeriodicTask({
      name: 'event.archiver',
      intervalMs: ONE_HOUR_MS,
      logger,
      run: async () => {
        await this.run();
      },
    });
    this.task.start();
  }

  async run() {
    if (!this.isRunning) return;
    logger.info('Archiver: Checking for events older than retention period...');
    // Implementation: Move events older than 7 years to secondary storage (e.g. S3)
    // For now, this is a stub as per local development needs
  }

  stop() {
    this.isRunning = false;
    this.task?.stop();
    this.task = null;
  }
}

export const archiver = new Archiver();
