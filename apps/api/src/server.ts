import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import authPlugin from './plugins/auth';
import errorPlugin from './plugins/errors';
import { registerRoutes } from './routes/index';

const PORT = Number(process.env.PORT ?? 4000);

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(cors, { origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','), credentials: true });
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-me' });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(errorPlugin);
  await app.register(authPlugin);
  app.get('/api/health', async () => ({ message: 'ok', data: { status: 'up', time: new Date().toISOString() } }));
  await registerRoutes(app);
  return app;
}

const app = await buildApp();
app.listen({ port: PORT, host: '0.0.0.0' }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
