import twilio from 'twilio';
import { storage } from '../../storage';
import { encryption } from '../../utils/encryption';

export class UserTwilioService {
  private static clients: Map<string, any> = new Map();

  static async getClient(tenantId: number) {
    const cacheKey = `tenant_${tenantId}`;
    if (this.clients.has(cacheKey)) {
      return this.clients.get(cacheKey);
    }

    const settings = await storage.getSetting(tenantId, 'twilio');
    if (!settings || !settings.accountSid || !settings.authToken) {
      throw new Error('Twilio credentials not configured for this tenant');
    }

    // Use decryption utility as specified in Phase 2
    const authToken = encryption.decrypt(settings.authToken);
    const client = twilio(settings.accountSid, authToken);
    this.clients.set(cacheKey, client);
    return client;
  }

  static clearCache(tenantId: number) {
    this.clients.delete(`tenant_${tenantId}`);
  }
}
