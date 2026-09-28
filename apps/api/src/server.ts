import { loadEnvFile } from './config';

loadEnvFile();

const { buildApp } = await import('./app');
const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: app.config.host, port: app.config.port });
  app.log.info(`API docs: http://localhost:${app.config.port}/api/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
