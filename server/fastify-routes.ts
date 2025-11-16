/**
 * Fastify Route Registration
 * This file registers all API routes with the Fastify server
 */

import type { FastifyInstance } from 'fastify';
import { registerRoutes as registerExpressRoutes } from './routes';

export async function registerFastifyRoutes(fastify: FastifyInstance) {
  // For now, we'll delegate to the existing Express routes setup
  // which returns an HTTP server. We'll need to adapt this approach.
  
  // The routes will be migrated incrementally, but for now we use
  // the existing route structure.
  
  // Register a test route to verify Fastify is working
  fastify.get('/api/fastify-test', async (request, reply) => {
    return {
      message: 'Fastify is working!',
      timestamp: new Date().toISOString(),
    };
  });

  return fastify;
}
