// Queue names — one place. Job handlers land per ADR-010's list: next-action
// reminders, special-events cadence, event-inbox processing, reconciliation,
// target/leaderboard rollups.

export const QUEUES = {
  scheduled: 'scheduled',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
