import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RateLimitPluginOptions } from '@fastify/rate-limit';

/**
 * Rate Limiter Configurations for Fastify
 * Migrated from Express rate-limit to @fastify/rate-limit
 */

// Define all rate limit configurations
export const rateLimitConfigs = {
  // General API rate limiter - applies to most endpoints
  api: {
    max: 300,
    timeWindow: '15 minutes',
    skipOnError: true,
  } as Partial<RateLimitPluginOptions>,

  // Strict rate limiter for authentication endpoints
  auth: {
    max: 5,
    timeWindow: '15 minutes',
    skipOnError: true,
    skipSuccessfulRequests: true,
  } as Partial<RateLimitPluginOptions>,

  // Very strict rate limiter for password reset/sensitive operations
  strict: {
    max: 3,
    timeWindow: '60 minutes',
    skipOnError: true,
  } as Partial<RateLimitPluginOptions>,

  // Generous rate limiter for Twilio webhooks
  webhook: {
    max: 60,
    timeWindow: '1 minute',
    skipOnError: true,
  } as Partial<RateLimitPluginOptions>,

  // Rate limiter for file/recording downloads
  download: {
    max: 30,
    timeWindow: '1 minute',
    skipOnError: true,
  } as Partial<RateLimitPluginOptions>,

  // Rate limiter for SMS sending
  sms: {
    max: 10,
    timeWindow: '1 minute',
    skipOnError: true,
  } as Partial<RateLimitPluginOptions>,

  // Rate limiter for making calls
  call: {
    max: 20,
    timeWindow: '1 minute',
    skipOnError: true,
  } as Partial<RateLimitPluginOptions>,

  // Rate limiter for Chrome extension API endpoints
  extension: {
    max: 100,
    timeWindow: '1 minute',
    skipOnError: true,
  } as Partial<RateLimitPluginOptions>,

  // Rate limiter for extension call operations
  extensionCall: {
    max: 30,
    timeWindow: '1 minute',
    skipOnError: true,
  } as Partial<RateLimitPluginOptions>,
};

// Helper to create rate limit hook
export function createRateLimitHook(config: Partial<RateLimitPluginOptions>) {
  return {
    config: {
      rateLimit: config
    }
  };
}
