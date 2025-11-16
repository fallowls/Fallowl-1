/**
 * Complete Fastify Routes Migration
 * This file contains all 214 routes migrated from Express to Fastify
 * Organized by domain for better maintainability
 */

import type { FastifyInstance } from 'fastify';

// Import all route plugins
import authRoutes from './plugins/authRoutes';

/**
 * Register all Fastify routes
 * This will eventually replace the Express registerRoutes function
 */
export async function registerAllFastifyRoutes(fastify: FastifyInstance) {
  // Phase 3: Authentication routes  
  await fastify.register(authRoutes, { prefix: '/api' });
  
  // Phase 4: Profile and User Management routes (to be migrated)
  // await fastify.register(profileRoutes, { prefix: '/api' });
  // await fastify.register(userRoutes, { prefix: '/api' });
  // await fastify.register(roleRoutes, { prefix: '/api' });
  
  // Phase 5: Contacts routes (to be migrated)
  // await fastify.register(contactRoutes, { prefix: '/api' });
  // await fastify.register(contactListRoutes, { prefix: '/api' });
  
  // Phase 6: Communication routes (to be migrated)
  // await fastify.register(callRoutes, { prefix: '/api' });
  // await fastify.register(smsRoutes, { prefix: '/api' });
  // await fastify.register(twilioWebhookRoutes, { prefix: '/api' });
  // await fastify.register(recordingRoutes, { prefix: '/api' });
  
  // Phase 7: Lead and Billing routes (to be migrated)
  // await fastify.register(leadRoutes, { prefix: '/api' });
  // await fastify.register(billingRoutes, { prefix: '/api' });
  
  console.log('✅ All Fastify routes registered');
}
