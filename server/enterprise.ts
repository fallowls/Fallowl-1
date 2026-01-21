import { withTenant } from './db';
import { products } from './schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * An example enterprise-level service function that retrieves products for a given tenant.
 * It demonstrates how to use the `withTenant` function to ensure all database
 * operations are securely scoped to the correct tenant's schema.
 * @param tenantId - The ID of the tenant making the request.
 * @returns A list of products for the specified tenant.
 */
export async function getProductsForTenant(tenantId: string) {
  // The `withTenant` function handles the transaction and sets the search_path.
  // All database operations inside this callback are guaranteed to be against the
  // correct tenant's schema.
  return await withTenant(tenantId, async (tx: NodePgDatabase) => {
    // This query will be executed on the 'products' table within the tenant's dedicated schema.
    const productList = await tx.select().from(products);
    return productList;
  });
}
