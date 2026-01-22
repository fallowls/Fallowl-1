/**
 * Automatic Twilio Webhook Verification and Update Service
 * Runs on app startup to ensure all TwiML applications have correct webhook URLs
 */

import { storage } from '../storage';
import { userTwilioCache } from '../userTwilioService';
import { getBaseUrl, getUserTwilioWebhookUrls, logUrlConfiguration, isProductionUrl } from '../utils/urlConfig';
import { generateWebhookToken } from '../routes';

interface WebhookVerificationResult {
  userId: number;
  username?: string;
  twimlAppSid?: string;
  status: 'verified' | 'updated' | 'missing' | 'error' | 'skipped';
  message: string;
  details?: any;
}

export class TwilioWebhookVerifier {
  private static instance: TwilioWebhookVerifier;

  static getInstance(): TwilioWebhookVerifier {
    if (!TwilioWebhookVerifier.instance) {
      TwilioWebhookVerifier.instance = new TwilioWebhookVerifier();
    }
    return TwilioWebhookVerifier.instance;
  }

  /**
   * Verify and update all users' Twilio webhook configurations
   * Should be called on app startup
   */
  async verifyAllWebhooks(): Promise<WebhookVerificationResult[]> {
    console.log('\n🔍 Starting automatic Twilio webhook verification...');
    logUrlConfiguration();

    const baseUrl = getBaseUrl();
    
    // Skip verification in local development
    if (!isProductionUrl(baseUrl)) {
      console.log('⏭️  Skipping webhook verification in local development environment');
      return [];
    }

    try {
      // Get all users with Twilio configured
      const users = await storage.getAllUsers();
      const results: WebhookVerificationResult[] = [];

      for (const user of users) {
        const result = await this.verifyUserWebhooks(user.id, user.username, baseUrl);
        results.push(result);
      }

      // Summary
      const verified = results.filter(r => r.status === 'verified').length;
      const updated = results.filter(r => r.status === 'updated').length;
      const missing = results.filter(r => r.status === 'missing').length;
      const errors = results.filter(r => r.status === 'error').length;
      const skipped = results.filter(r => r.status === 'skipped').length;

      console.log('\n📊 Webhook Verification Summary:');
      console.log(`   ✅ Verified (already correct): ${verified}`);
      console.log(`   🔄 Updated (fixed): ${updated}`);
      console.log(`   ⚠️  Missing (no TwiML app): ${missing}`);
      console.log(`   ❌ Errors: ${errors}`);
      console.log(`   ⏭️  Skipped (no Twilio configured): ${skipped}`);
      console.log('');

      return results;
    } catch (error: any) {
      console.error('❌ Webhook verification failed:', error.message);
      return [];
    }
  }

  /**
   * Verify a single user's Twilio webhooks
   */
  private async verifyUserWebhooks(
    userId: number, 
    username: string, 
    baseUrl: string
  ): Promise<WebhookVerificationResult> {
    try {
      // Check if user has Twilio configured
      const userCreds = await storage.getUserTwilioCredentials(userId);
      
      if (!userCreds || !userCreds.twilioConfigured) {
        return {
          userId,
          username,
          status: 'skipped',
          message: 'Twilio not configured'
        };
      }

      if (!userCreds.twilioTwimlAppSid) {
        return {
          userId,
          username,
          status: 'missing',
          message: 'No TwiML Application SID found'
        };
      }

      // Get user's Twilio client
      const membership = await storage.ensureDefaultTenant(userId);
      if (!membership) {
        console.warn(`⚠️ User ${username} (${userId}): No default tenant membership found/created. Skipping.`);
        return {
          userId,
          username,
          status: 'skipped',
          message: 'No tenant membership available'
        };
      }
      
      const tenantId = membership.tenantId;
      
      // Verify user is still a member of this tenant to prevent security alerts
      const currentMembership = await storage.getTenantMembership(tenantId, userId);
      if (!currentMembership) {
        console.error(`❌ User ${username} (${userId}): Security Alert - Membership lost for tenant ${tenantId}`);
        return {
          userId,
          username,
          status: 'error',
          message: `Security Alert: User ${userId} no longer member of tenant ${tenantId}`
        };
      }

      const { client } = await userTwilioCache.getTwilioClient(userId, tenantId.toString());
      
      // Fetch current TwiML application
      const app = await client.applications(userCreds.twilioTwimlAppSid).fetch();
      
      // Generate expected webhook URLs
      const token = generateWebhookToken(userId);
      const expectedUrls = getUserTwilioWebhookUrls(token, baseUrl);

      // Check if webhooks match
      const voiceUrlMatches = app.voiceUrl === expectedUrls.voiceUrl;
      const statusUrlMatches = app.statusCallback === expectedUrls.statusCallbackUrl;
      const methodsMatch = app.voiceMethod === 'POST' && app.statusCallbackMethod === 'POST';

      if (voiceUrlMatches && statusUrlMatches && methodsMatch) {
        console.log(`✅ User ${username} (${userId}): Webhooks verified`);
        return {
          userId,
          username,
          twimlAppSid: userCreds.twilioTwimlAppSid,
          status: 'verified',
          message: 'Webhooks already correct'
        };
      }

      // Update webhooks
      console.log(`🔄 User ${username} (${userId}): Updating webhooks...`);
      console.log(`   Current Voice URL: ${app.voiceUrl}`);
      console.log(`   Expected Voice URL: ${expectedUrls.voiceUrl}`);

      await client.applications(userCreds.twilioTwimlAppSid).update({
        voiceUrl: expectedUrls.voiceUrl,
        voiceMethod: 'POST',
        statusCallback: expectedUrls.statusCallbackUrl,
        statusCallbackMethod: 'POST'
      });

      console.log(`✅ User ${username} (${userId}): Webhooks updated successfully`);
      
      return {
        userId,
        username,
        twimlAppSid: userCreds.twilioTwimlAppSid,
        status: 'updated',
        message: 'Webhooks updated to correct URLs',
        details: {
          previous: {
            voiceUrl: app.voiceUrl,
            statusCallback: app.statusCallback
          },
          updated: {
            voiceUrl: expectedUrls.voiceUrl,
            statusCallback: expectedUrls.statusCallbackUrl
          }
        }
      };
    } catch (error: any) {
      console.error(`❌ User ${username} (${userId}): Verification failed:`, error.message);
      return {
        userId,
        username,
        status: 'error',
        message: `Error: ${error.message}`
      };
    }
  }

  /**
   * Manually verify a specific user's webhooks
   * Can be called via API endpoint for troubleshooting
   */
  async verifyUserWebhooksManually(userId: number): Promise<WebhookVerificationResult> {
    const baseUrl = getBaseUrl();
    const user = await storage.getUser(userId);
    return this.verifyUserWebhooks(userId, user?.username || 'unknown', baseUrl);
  }
}

// Export singleton instance
export const twilioWebhookVerifier = TwilioWebhookVerifier.getInstance();
