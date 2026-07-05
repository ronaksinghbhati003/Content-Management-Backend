import config from './config';
import logger from './config/logger';
import createApp from './app';
import connectDb from './config/database';
import { startPublishScheduler, stopPublishScheduler } from './modules/publish/publish.scheduler';

const app = createApp();

// ── Start Server ──────────────────────────────────────────────────────────────
const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`🚀 Server running on http://localhost:${config.port}`);
  logger.info(`📚 Swagger docs at http://localhost:${config.port}/api-docs`);
  logger.info(`🌍 Environment: ${config.nodeEnv}`);
  connectDb();

  // Start the background publish scheduler
  startPublishScheduler();
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
const gracefulShutdown = (signal: string): void => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  stopPublishScheduler();
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown — could not close connections in time.');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ── Unhandled Errors ──────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection', { reason });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { message: error.message, stack: error.stack });
  process.exit(1);
});

export default server;
