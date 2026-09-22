import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://diamondbill:diamondbill@localhost:5432/diamondbill';

export const sql = postgres(DATABASE_URL, { max: 10, onnotice: () => {} });
export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { schema };
