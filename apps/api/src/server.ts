// Boot order matters (E01-F04/F05):
//   1. Register every settings spec. Registration is a pure, infra-free
//      declaration — doing it BEFORE the config runtime warms means the boot
//      warm actually covers those keys, and the ops settings screen lists them
//      even in a deployment where Connect itself is off (dev, SMS_PROVIDER=fake).
//   2. platform-config runtime — the store/bus the specs resolve through.
//   3. Connect — a throw here is FATAL: a missing or invalid master key means
//      credential storage is dead, and a silently-fake OTP path is how an
//      outage hides. We refuse to serve rather than accept logins we cannot
//      deliver codes for.
//   4. serve.

import { config } from '@arad-crm/config';
import { registerConnectSettings } from '@arad/connect';
import { logger } from '@arad/logger';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { startConnect } from './lib/connect-wiring.js';
import { startPlatformConfig } from './lib/platform-config-wiring.js';

const main = async (): Promise<void> => {
  registerConnectSettings();
  await startPlatformConfig();
  await startConnect();

  const app = createApp();
  const server = serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
    logger.info({ port: info.port, smsProvider: config.SMS_PROVIDER }, 'arad-crm-api listening');
  });

  // Without a listener, a bind failure surfaces as an unhandled 'error' event:
  // twenty lines of node internals whose only real content is the port number.
  // The common cause is an ORPHANED dev api — `tsx watch` supervisors outlive a
  // Ctrl-C'd `pnpm dev` and quietly hold the port — so the message says how to
  // find it rather than making the next person go read `lsof` docs.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        { port: config.API_PORT, hint: `lsof -nP -iTCP:${config.API_PORT} -sTCP:LISTEN` },
        `port ${config.API_PORT} is already in use — something else (most likely an older dev api that outlived its terminal) is holding it. Find it with the command in \`hint\` and kill that pid, or set API_PORT to a free port.`,
      );
      process.exit(1);
    }
    logger.error({ err }, 'arad-crm-api server error');
    process.exit(1);
  });
};

main().catch((err: unknown) => {
  logger.error({ err }, 'arad-crm-api failed to boot');
  process.exit(1);
});
