/**
 * Centralized URL configuration for Twilio webhooks and application URLs
 * This ensures consistent URL handling across all services
 */

/**
 * Get the base URL for the application
 * Priority: BASE_URL > REPLIT_DOMAINS > REPLIT_DEV_DOMAIN > localhost
 */
export function getBaseUrl(): string {
  // Custom BASE_URL (for AWS, custom deployments, etc.)
  if (process.env.BASE_URL) {
    let url = process.env.BASE_URL.trim();
    
    // Remove trailing slashes
    url = url.replace(/\/+$/, '');
    
    // Ensure HTTPS in production (if not localhost)
    if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
      if (!url.startsWith('https://') && !url.startsWith('http://')) {
        url = `https://${url}`;
      } else if (url.startsWith('http://')) {
        url = url.replace(/^http:\/\//, 'https://');
        console.warn('⚠️ BASE_URL was HTTP, converted to HTTPS for production:', url);
      }
    }
    
    return url;
  }
  
  // Production: Use REPLIT_DOMAINS (comma-separated list, use first domain)
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    const domain = domains[0].trim();
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }
  
  // Development on Replit: Use REPLIT_DEV_DOMAIN
  if (process.env.REPLIT_DEV_DOMAIN) {
    const domain = process.env.REPLIT_DEV_DOMAIN.trim();
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }
  
  // Local development fallback
  return 'http://localhost:5000';
}

/**
 * Check if we're running in a production-like environment
 * (i.e., not localhost)
 */
export function isProductionUrl(url?: string): boolean {
  const checkUrl = url || getBaseUrl();
  return !checkUrl.includes('localhost') && !checkUrl.includes('127.0.0.1');
}

/**
 * Get Twilio webhook URLs for voice and status callbacks
 */
export interface TwilioWebhookUrls {
  voiceUrl: string;
  statusCallbackUrl: string;
  smsUrl: string;
  conferenceStatusUrl: string;
}

/**
 * Get standard Twilio webhook URLs without user-specific tokens
 * Used for admin/system-level TwiML applications
 */
export function getTwilioWebhookUrls(baseUrl?: string): TwilioWebhookUrls {
  const base = baseUrl || getBaseUrl();
  
  return {
    voiceUrl: `${base}/api/twilio/voice`,
    statusCallbackUrl: `${base}/api/twilio/status`,
    smsUrl: `${base}/api/twilio/sms`,
    conferenceStatusUrl: `${base}/api/twilio/conference-status`
  };
}

/**
 * Get user-specific Twilio webhook URLs with authentication tokens
 * Used for user-specific TwiML applications
 */
export function getUserTwilioWebhookUrls(token: string, baseUrl?: string): TwilioWebhookUrls {
  const base = baseUrl || getBaseUrl();
  const encodedToken = encodeURIComponent(token);
  
  return {
    voiceUrl: `${base}/api/twilio/voice?token=${encodedToken}`,
    statusCallbackUrl: `${base}/api/twilio/status?token=${encodedToken}`,
    smsUrl: `${base}/api/twilio/sms?token=${encodedToken}`,
    conferenceStatusUrl: `${base}/api/twilio/conference-status?token=${encodedToken}`
  };
}

/**
 * Get parallel dialer webhook URL with all required parameters
 */
export function getParallelDialerWebhookUrl(params: {
  token: string;
  lineId: number;
  name: string;
  userId: number;
  baseUrl?: string;
}): string {
  const base = params.baseUrl || getBaseUrl();
  const queryParams = new URLSearchParams({
    token: params.token,
    lineId: String(params.lineId),
    name: params.name,
    userId: String(params.userId)
  });
  
  return `${base}/api/twilio/voice/parallel-dialer?${queryParams.toString()}`;
}

/**
 * Log current URL configuration for debugging
 */
export function logUrlConfiguration(): void {
  const baseUrl = getBaseUrl();
  const isProd = isProductionUrl();
  const urls = getTwilioWebhookUrls();
  
  console.log('📍 URL Configuration:');
  console.log(`   Environment: ${isProd ? 'Production' : 'Development'}`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Voice URL: ${urls.voiceUrl}`);
  console.log(`   Status Callback: ${urls.statusCallbackUrl}`);
  console.log(`   SMS URL: ${urls.smsUrl}`);
  console.log(`   REPLIT_DOMAINS: ${process.env.REPLIT_DOMAINS || 'not set'}`);
  console.log(`   REPLIT_DEV_DOMAIN: ${process.env.REPLIT_DEV_DOMAIN || 'not set'}`);
}
