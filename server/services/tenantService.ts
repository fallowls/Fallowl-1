import { db } from '../db';
import { tenants } from '../schema';
import { eq } from 'drizzle-orm';
import { encryptCredential, decryptCredential } from '../encryption';
import { NotFoundError } from '../utils/errors';

export class TenantService {
  async createTenant(tenantData: { name: string; slug?: string }) {
    const slugValue = tenantData.slug || tenantData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const [newTenant] = await db.insert(tenants).values({
      name: tenantData.name,
      slug: slugValue,
      status: 'active',
      plan: 'free'
    }).returning();
    return newTenant;
  }

  async getTenantById(id: number) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    if (!tenant) {
      throw new NotFoundError(`Tenant with ID ${id} not found`);
    }
    return tenant;
  }

  async getTenantBySlug(slug: string) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant || null;
  }

  async getAllTenants() {
    return await db.select().from(tenants);
  }

  async updateTenant(id: number, updateData: any) {
    const [updated] = await db.update(tenants)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    if (!updated) {
      throw new NotFoundError(`Tenant with ID ${id} not found`);
    }
    return updated;
  }

  async deleteTenant(id: number) {
    const result = await db.delete(tenants).where(eq(tenants.id, id)).returning();
    if (result.length === 0) {
      throw new NotFoundError(`Tenant with ID ${id} not found`);
    }
  }

  async updateTwilioCredentials(
    tenantId: number,
    credentials: { accountSid: string; authToken: string; apiKeySid: string; apiKeySecret: string }
  ) {
    const encryptedCredentials = {
      twilioAccountSid: encryptCredential(credentials.accountSid),
      twilioAuthToken: encryptCredential(credentials.authToken),
      twilioApiKeySid: encryptCredential(credentials.apiKeySid),
      twilioApiKeySecret: encryptCredential(credentials.apiKeySecret),
    };
    await this.updateTenant(tenantId, encryptedCredentials);
  }

  async getTwilioCredentials(tenantId: number) {
    const tenant = await this.getTenantById(tenantId);
    
    return {
      accountSid: decryptCredential(tenant.twilioAccountSid),
      authToken: decryptCredential(tenant.twilioAuthToken),
      apiKeySid: decryptCredential(tenant.twilioApiKeySid),
      apiKeySecret: decryptCredential(tenant.twilioApiKeySecret),
    };
  }
}

export const tenantService = new TenantService();
