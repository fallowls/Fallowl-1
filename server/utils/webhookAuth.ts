import crypto from "crypto";

// Helper function to generate signed webhook tokens for user identification
export function generateWebhookToken(userId: number): string {
  if (!process.env.ENCRYPTION_KEY) {
    // Fallback for development if not set, but warn
    console.warn('⚠️ ENCRYPTION_KEY not set - using insecure fallback for webhook tokens');
    const fallbackKey = 'dev-fallback-key-do-not-use-in-prod';
    const timestamp = Date.now().toString();
    const signature = crypto
      .createHmac('sha256', fallbackKey)
      .update(`${timestamp}:${userId}`)
      .digest('hex');
    return `${timestamp}:${userId}:${signature}`;
  }
  
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY)
    .update(`${timestamp}:${userId}`)
    .digest('hex');
  return `${timestamp}:${userId}:${signature}`;
}

// Helper function to verify and decode webhook tokens
export function verifyWebhookToken(token: string): number {
  const key = process.env.ENCRYPTION_KEY || 'dev-fallback-key-do-not-use-in-prod';
  
  const parts = token.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid webhook token format');
  }
  
  const [timestamp, userIdStr, signature] = parts;
  const userId = parseInt(userIdStr);
  
  if (isNaN(userId)) {
    throw new Error('Invalid user ID in token');
  }
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', key)
    .update(`${timestamp}:${userId}`)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    throw new Error('Invalid webhook token signature');
  }
  
  // Optionally check token age (e.g., reject tokens older than 24 hours)
  const tokenAge = Date.now() - parseInt(timestamp);
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  if (tokenAge > maxAge) {
    throw new Error('Webhook token expired');
  }
  
  return userId;
}
