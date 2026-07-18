// BullMQ consumer (ADR-003). Repeatable sweeps follow Mizro's worker pattern:
// idempotent handlers + `*_sent` idempotency-ledger tables (never trust
// at-least-once delivery with money or messages).

import { config } from '@arad-crm/config';
import { logger } from '@arad/logger';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES } from './queues.js';

const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

const scheduledQueue = new Queue(QUEUES.scheduled, { connection });

const registerRepeatables = async (): Promise<void> => {
  // Heartbeat proves the repeatable pipeline end-to-end; real sweeps
  // (reminders, cadences, reconciliation) replace it per the build order.
  await scheduledQueue.upsertJobScheduler(
    'heartbeat',
    { every: 5 * 60 * 1000 },
    { name: 'heartbeat', data: {} },
  );
};

const worker = new Worker(
  QUEUES.scheduled,
  async (job) => {
    if (job.name === 'heartbeat') {
      logger.info({ job: job.name }, 'worker heartbeat');
      return;
    }
    logger.warn({ job: job.name }, 'no handler for job');
  },
  { connection },
);

worker.on('failed', (job, err) => {
  logger.error({ job: job?.name, err }, 'job failed');
});

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  await scheduledQueue.close();
  connection.disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

registerRepeatables()
  .then(() => logger.info('arad-crm-worker running'))
  .catch((err) => {
    logger.error({ err }, 'worker boot failed');
    process.exit(1);
  });
