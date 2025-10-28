/**
 * ============================================================================
 * FASTIFY MIGRATION - DEPENDENCY MAPPING DOCUMENTATION
 * ============================================================================
 * 
 * This file documents the Express -> Fastify migration mapping for all
 * middleware, plugins, and dependencies used in this application.
 * 
 * MIGRATION STRATEGY:
 * - Phase 1: Foundation setup (this file)
 * - Phase 2: Core middleware (CORS, body parsing, sessions, logging)
 * - Phase 3: Authentication & authorization
 * - Phase 4: Rate limiting
 * - Phase 5-6: API routes migration
 * - Phase 7: WebSocket, Vite, final cutover
 * 
 * ============================================================================
 * CORE FRAMEWORK
 * ============================================================================
 * Express (express)              -> Fastify (fastify)
 * 
 * Key Differences:
 * - Fastify uses schema-based validation (JSON Schema)
 * - Fastify has built-in JSON parsing (faster than Express)
 * - Fastify uses plugins instead of middleware
 * - Fastify has decorators for extending request/reply objects
 * - Fastify uses hooks (onRequest, preHandler, etc.) instead of middleware chain
 * 
 * ============================================================================
 * MIDDLEWARE -> PLUGINS MAPPING
 * ============================================================================
 * 
 * 1. CORS
 *    Express: cors                        -> Fastify: @fastify/cors
 *    Status: ✅ Installed
 *    Notes: Very similar API, slightly different configuration structure
 * 
 * 2. BODY PARSING
 *    Express: express.json()              -> Fastify: Built-in (no plugin needed)
 *    Express: express.urlencoded()        -> Fastify: @fastify/formbody
 *    Status: ✅ Installed
 *    Notes: Fastify's JSON parser is faster than Express by default
 * 
 * 3. STATIC FILE SERVING
 *    Express: express.static()            -> Fastify: @fastify/static
 *    Status: ✅ Installed
 *    Notes: Similar usage, registered as plugin
 * 
 * 4. SESSION MANAGEMENT
 *    Express: express-session             -> Fastify: @fastify/session
 *    Express: connect-pg-simple           -> Fastify: connect-pg-simple (compatible!)
 *    Status: ✅ Installed, ⚠️ Requires @fastify/cookie
 *    Notes: connect-pg-simple works with both Express and Fastify
 *           Must register @fastify/cookie BEFORE @fastify/session
 * 
 * 5. RATE LIMITING
 *    Express: express-rate-limit          -> Fastify: @fastify/rate-limit
 *    Status: ✅ Installed
 *    Notes: Different API - uses Fastify plugin system
 *           Supports Redis, in-memory stores
 * 
 * 6. SECURITY HEADERS
 *    Express: helmet                      -> Fastify: @fastify/helmet
 *    Status: ✅ Installed
 *    Notes: Same maintainer (helmetjs), very similar API
 * 
 * 7. MULTIPART/FILE UPLOADS
 *    Express: multer                      -> Fastify: @fastify/multipart
 *    Status: ✅ Installed
 *    Notes: Different API, uses streams by default
 * 
 * 8. WEBSOCKET
 *    Express: ws                          -> Fastify: @fastify/websocket
 *    Status: ✅ Installed
 *    Notes: Fastify plugin wraps 'ws' library
 * 
 * ============================================================================
 * AUTHENTICATION & AUTHORIZATION
 * ============================================================================
 * 
 * 1. JWT VALIDATION (Auth0)
 *    Express: express-jwt                 -> Fastify: @fastify/jwt
 *    Express: jwks-rsa (expressJwtSecret) -> Fastify: fastify-auth0-verify
 *    Status: ✅ Installed
 *    Notes: fastify-auth0-verify handles JWKS automatically
 *           Alternative: Use @fastify/jwt with manual JWKS setup
 * 
 * 2. SESSION-BASED AUTH
 *    Express: Custom middleware           -> Fastify: preHandler hooks
 *    Status: ⏳ To be migrated in Phase 3
 *    Notes: requireAuth will become a Fastify preHandler
 *           Use fastify.decorate() to add auth helpers
 * 
 * ============================================================================
 * DATABASE & ORM
 * ============================================================================
 * 
 * PostgreSQL: pg (Pool)                   -> Same (pg)
 * ORM: drizzle-orm                        -> Same (drizzle-orm)
 * Status: ✅ No change needed
 * Notes: Database layer remains unchanged
 * 
 * ============================================================================
 * ROUTE STRUCTURE DIFFERENCES
 * ============================================================================
 * 
 * Express:
 *   app.get('/api/users', middleware1, middleware2, handler)
 * 
 * Fastify:
 *   fastify.get('/api/users', {
 *     preHandler: [middleware1, middleware2],
 *     schema: { ... },      // JSON Schema validation
 *   }, handler)
 * 
 * OR using plugins:
 *   fastify.register(async (fastify) => {
 *     fastify.get('/api/users', handler)
 *   }, { prefix: '/api' })
 * 
 * ============================================================================
 * REQUEST/RESPONSE DIFFERENCES
 * ============================================================================
 * 
 * Express                    | Fastify
 * ---------------------------|-------------------------------------------
 * req.body                   | request.body (same)
 * req.params                 | request.params (same)
 * req.query                  | request.query (same)
 * req.headers                | request.headers (same)
 * req.session                | request.session (same with @fastify/session)
 * res.json(data)             | reply.send(data) or reply.code(200).send(data)
 * res.status(404).json(...)  | reply.code(404).send(...)
 * res.send(text)             | reply.send(text)
 * next()                     | Not needed (async/await based)
 * next(error)                | throw error OR reply.send(error)
 * 
 * ============================================================================
 * ERROR HANDLING DIFFERENCES
 * ============================================================================
 * 
 * Express:
 *   app.use((err, req, res, next) => {
 *     res.status(err.status || 500).json({ message: err.message })
 *   })
 * 
 * Fastify:
 *   fastify.setErrorHandler((error, request, reply) => {
 *     const status = error.statusCode || 500
 *     reply.code(status).send({ message: error.message })
 *   })
 * 
 * ============================================================================
 * MIGRATION CHECKLIST
 * ============================================================================
 * 
 * ✅ Phase 1: Foundation
 *    - Install all Fastify packages
 *    - Create basic Fastify server
 *    - Document dependency mapping
 * 
 * ⏳ Phase 2: Core Middleware
 *    - CORS configuration
 *    - Body parsing
 *    - Session management with PostgreSQL
 *    - Request logging
 * 
 * ⏳ Phase 3: Authentication
 *    - Auth0 JWT validation
 *    - Session-based auth
 *    - requireAuth decorator
 * 
 * ⏳ Phase 4: Rate Limiting
 *    - API rate limiter
 *    - Auth rate limiter
 *    - Webhook rate limiter
 *    - SMS/Call rate limiters
 * 
 * ⏳ Phase 5: API Routes Part 1
 *    - Authentication routes
 *    - User profile routes
 *    - User management routes
 * 
 * ⏳ Phase 6: API Routes Part 2
 *    - Twilio integration routes
 *    - Contact management routes
 *    - Lead management routes
 *    - Communication routes
 * 
 * ⏳ Phase 7: WebSocket & Vite
 *    - WebSocket service migration
 *    - Vite dev server integration
 *    - Static file serving
 *    - Final cutover
 * 
 * ============================================================================
 */

import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const log = (message: string) => {
  console.log(`[FASTIFY] ${message}`);
};

export async function createFastifyServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: 'info',
    },
    trustProxy: true, // Important for rate limiting and CORS with proxies
    bodyLimit: 50 * 1024 * 1024, // 50MB limit (matches Express config)
  });

  // Basic health check route to verify Fastify is running
  fastify.get('/api/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      status: 'ok',
      server: 'fastify',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  return fastify;
}

// Initialize and start Fastify server on port 5001 (parallel to Express on 5000)
export async function startFastifyServer() {
  try {
    const fastify = await createFastifyServer();

    const port = 5001; // Different port to avoid conflict with Express
    const host = '0.0.0.0';

    await fastify.listen({ port, host });
    
    log(`✅ Fastify server running on http://${host}:${port}`);
    log(`   Health check: http://localhost:${port}/api/health`);
    log(`   Express server continues on port 5000`);
    
    return fastify;
  } catch (error) {
    log(`❌ Error starting Fastify server: ${error}`);
    process.exit(1);
  }
}
