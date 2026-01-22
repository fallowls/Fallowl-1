import { db } from '../db';
import { subscriptions } from '../schema';
import { eq, and } from 'drizzle-orm';

export class SubscriptionService {
  /**
   * Creates a new subscription for a tenant.
   */
  async createSubscription(tenantId: string, planId: string): Promise<any> {
    const [newSubscription] = await db.insert(subscriptions).values({ tenantId, planId, status: 'active' }).returning();
    return newSubscription;
  }

  /**
   * Retrieves a tenant's subscription.
   */
  async getSubscriptionByTenant(tenantId: string): Promise<any | null> {
    const result = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
    return result[0] || null;
  }

  /**
   * Cancels a tenant's subscription.
   */
  async cancelSubscription(tenantId: string): Promise<void> {
    await db.update(subscriptions).set({ status: 'canceled' }).where(eq(subscriptions.tenantId, tenantId));
  }
}
