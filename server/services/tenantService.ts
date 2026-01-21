import { db } from '../db';
import { tenants } from '../schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Finds an active tenant by their API key from the public tenants table.
 * @param apiKey The API key provided in the request.
 * @returns The tenant object if found and active, otherwise null.
 */
export async function findTenantByApiKey(apiKey: string): Promise<{ id: string; status: string } | null> {
  // All tenant lookups happen in the 'public' schema.
  const allTenants = await db.select().from(tenants);

  for (const tenant of allTenants) {
     if (tenant.apiKeyHash) { // Check if apiKeyHash is not null
        const isMatch = await secureCompare(apiKey, tenant.apiKeyHash);
        if (isMatch) {
            return { id: tenant.id, status: tenant.status };
        }
    }
  }
  return null;
}

/**
 * Finds an active tenant by their custom domain from the public tenants table.
 * @param domain The custom domain (subdomain) from the request hostname.
 * @returns The tenant object if found and active, otherwise null.
 */
export async function findTenantByDomain(domain: string): Promise<{ id: string; status: string } | null> {
  const result = await db.select().from(tenants).where(eq(tenants.customDomain, domain));
  const tenant = result[0];
  if (tenant && tenant.status === 'active') {
    return { id: tenant.id, status: tenant.status };
  }
  return null;
}

/**
 * Compares a plaintext key with a hash in a way that resists timing attacks.
 * @param plaintextKey The key from the request.
 * @param hash The hashed key from the database.
 */
async function secureCompare(plaintextKey: string, hash: string): Promise<boolean> {
  const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');
  const keyHashBuffer = Buffer.from(keyHash, 'hex');
  const dbHashBuffer = Buffer.from(hash, 'hex');

  if (keyHashBuffer.length !== dbHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(keyHashBuffer, dbHashBuffer);
}
