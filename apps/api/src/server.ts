import { config } from '@arad-crm/config';
import { logger } from '@arad/logger';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const app = createApp();

serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
  logger.info({ port: info.port }, 'arad-crm-api listening');
});
