// BullMQ consumer (ADR-003). Repeatable sweeps follow Mizro's worker pattern:
// idempotent handlers + `*_sent` idempotency-ledger tables (never trust
// at-least-once delivery with money or messages).

import { config } from '@arad-crm/config';
import { logger } from '@arad/logger';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sweepInbox } from './processor.js';
import { QUEUES } from './queues.js';

const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

const scheduledQueue = new Queue(QUEUES.scheduled, { connection });

const registerRepeatables = async (): Promise<void> => {
  await scheduledQueue.upsertJobScheduler(
    'heartbeat',
    { every: 5 * 60 * 1000 },
    { name: 'heartbeat', data: {} },
  );
  // ADR-006: integration inbox sweep — pending/failed rows, oldest first
  await scheduledQueue.upsertJobScheduler(
    'inbox-sweep',
    { every: 15 * 1000 },
    { name: 'inbox-sweep', data: {} },
  );
};

const worker = new Worker(
  QUEUES.scheduled,
  async (job) => {
    if (job.name === 'heartbeat') {
      logger.info({ job: job.name }, 'worker heartbeat');
      return;
    }
    if (job.name === 'inbox-sweep') {
      const n = await sweepInbox();
      if (n > 0) logger.info({ processed: n }, 'inbox sweep');
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
