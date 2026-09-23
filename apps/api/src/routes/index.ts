import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { orgRoutes } from './org';
import { seriesRoutes } from './series';
import { accountRoutes } from './accounts';
import { customFieldRoutes } from './customFields';
import { contactRoutes } from './contacts';
import { userRoutes } from './users';
import { settingsRoutes } from './settings';
import { prefRoutes } from './prefs';
import { masterRoutes } from './masters';
import { productRoutes } from './products';
import { certifiedRoutes } from './certified';
import { stockRoutes } from './stock';
import { rapaportRoutes } from './rapaport';

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
  await app.register(masterRoutes);
  await app.register(productRoutes);
  await app.register(certifiedRoutes);
  await app.register(stockRoutes);
  await app.register(rapaportRoutes);
}
