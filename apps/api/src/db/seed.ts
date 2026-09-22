import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, sql, schema } from './client';
import { seedTenantDefaults, seedMasterDefaults } from '../services/tenant-setup';

const TENANT_SLUG = process.env.SEED_TENANT_SLUG ?? 'demo';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@diamondbill.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@1234';

async function main() {
  const existing = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, TENANT_SLUG)).limit(1);
  if (existing.length) {
    await seedMasterDefaults(db, existing[0].id);
    console.log(`Tenant "${TENANT_SLUG}" already exists — master defaults backfilled where missing.`);
    return;
  }
  const [tenant] = await db.insert(schema.tenants).values({ name: 'Demo Diamond Inc', slug: TENANT_SLUG, reportingCurrency: 'INR' }).returning();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [admin] = await db
    .insert(schema.users)
    .values({
      tenantId: tenant.id,
      firstName: 'Admin',
      lastName: 'User',
      email: ADMIN_EMAIL,
      username: 'admin',
      mobile: '9999999999',
      passwordHash,
      role: 'super_admin',
    })
    .returning();
  const { firm, branch } = await seedTenantDefaults(db, tenant.id, { firmName: 'Demo Diamond Inc', currency: 'INR', countryCode: 'IN', createdBy: admin.id });
  await db.update(schema.users).set({ firmIds: [firm.id], branchIds: [branch.id] }).where(eq(schema.users.id, admin.id));
  console.log('Seeded tenant', tenant.slug);
  console.log(`Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end());
