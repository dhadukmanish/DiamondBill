import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { orgRoutes } from './org.js';
import { seriesRoutes } from './series.js';
import { accountRoutes } from './accounts.js';
import { customFieldRoutes } from './customFields.js';
import { contactRoutes } from './contacts.js';
import { userRoutes } from './users.js';
import { settingsRoutes } from './settings.js';
import { prefRoutes } from './prefs.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes);
  await app.register(orgRoutes);
  await app.register(seriesRoutes);
  await app.register(accountRoutes);
  await app.register(customFieldRoutes);
  await app.register(contactRoutes);
  await app.register(userRoutes);
  await app.register(settingsRoutes);
  await app.register(prefRoutes);
}
