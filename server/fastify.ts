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

import dotenv from "dotenv";

// Load environment variables from .env file FIRST
dotenv.config();

import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import cookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import connectPgSimple from 'connect-pg-simple';

const log = (message: string) => {
  console.log(`[FASTIFY] ${message}`);
};

// CORS configuration - mirrors Express setup
function getAllowedOrigins(): string[] {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }
  
  // Collect origins from environment variables and split comma-separated values
  const originSources = [
    process.env.CLIENT_ORIGIN,
    process.env.REPLIT_DOMAINS,
    process.env.REPLIT_DEV_DOMAIN,
    process.env.CHROME_EXTENSION_IDS // Comma-separated Chrome extension IDs
  ].filter((origin): origin is string => Boolean(origin));
  
  // Split comma-separated origins and trim whitespace
  const allowedOrigins = originSources
    .flatMap(origin => origin.split(','))
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
  
  if (allowedOrigins.length === 0) {
    console.error('❌ No CORS origins configured for production. Set CLIENT_ORIGIN, REPLIT_DOMAINS, or REPLIT_DEV_DOMAIN environment variable.');
  } else {
    console.log('✓ Production CORS origins configured:', allowedOrigins);
  }
  
  return allowedOrigins;
}

// Check if origin is a Chrome extension
function isChromeExtension(origin: string): boolean {
  return origin.startsWith('chrome-extension://');
}

export async function createFastifyServer(): Promise<FastifyInstance> {
  // Validate required environment variables
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable must be set for security. Please set SESSION_SECRET before starting the application.');
  }

  const fastify = Fastify({
    logger: {
      level: 'info',
    },
    trustProxy: true, // Important for rate limiting and CORS with proxies
    bodyLimit: 50 * 1024 * 1024, // 50MB limit (matches Express config)
  });

  // ============================================================================
  // PHASE 2: CORE MIDDLEWARE
  // ============================================================================

  // 1. CORS Configuration (mirrors Express setup exactly)
  const allowedOrigins = getAllowedOrigins();
  
  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }
      
      // In development, allow all origins including Chrome extensions
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      
      // Always allow Chrome extensions (they use their own authentication)
      if (isChromeExtension(origin)) {
        // Optionally validate against specific extension IDs
        const extensionIds = process.env.CHROME_EXTENSION_IDS?.split(',').map(id => id.trim()).filter(id => id.length > 0) || [];
        if (extensionIds.length === 0) {
          // If no extension IDs configured, allow all Chrome extensions in production
          return callback(null, true);
        }
        // Check if the origin matches any configured extension ID
        // Support both formats: "abc123" or "chrome-extension://abc123"
        const isAllowed = extensionIds.some(id => {
          const normalizedId = id.startsWith('chrome-extension://') ? id : `chrome-extension://${id}`;
          return origin === normalizedId;
        });
        if (isAllowed) {
          return callback(null, true);
        }
        console.warn(`⚠️ Chrome extension ${origin} not in allowed list`);
      }
      
      // In production, check against allowed origins
      if (allowedOrigins.length === 0) {
        console.warn(`⚠️ CORS request from ${origin} rejected - no origins configured`);
        return callback(new Error('CORS not configured'), false);
      }
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      console.warn(`⚠️ CORS request from ${origin} rejected - not in allowed origins: ${allowedOrigins.join(', ')}`);
      callback(new Error(`Origin ${origin} not allowed`), false);
    },
    credentials: true, // Allow cookies and authorization headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Extension-Version'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
  });

  log('✅ CORS configured');

  // 2. Body Parsing
  // JSON parsing is built-in to Fastify (already configured via bodyLimit)
  // Register formbody for URL-encoded data (replaces express.urlencoded)
  await fastify.register(formbody);
  
  log('✅ Body parsing configured (JSON built-in, formbody registered)');

  // 3. PostgreSQL Session Management
  // Must register cookie plugin BEFORE session plugin
  await fastify.register(cookie);
  
  const PgSession = connectPgSimple(fastifySession as any);
  
  await fastify.register(fastifySession, {
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: 'session',
    }),
    secret: process.env.SESSION_SECRET,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  });

  log('✅ PostgreSQL session store configured');

  // 4. Request Logging (mirrors Express logging middleware)
  fastify.addHook('onRequest', async (request, reply) => {
    // Store start time for duration calculation
    (request as any).startTime = Date.now();
  });

  // Capture JSON response body using onSend hook
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Store the response payload for logging
    if (reply.getHeader('content-type')?.toString().includes('application/json')) {
      try {
        // Payload is the serialized JSON string
        (request as any).responsePayload = JSON.parse(payload as string);
      } catch (e) {
        // If parsing fails, ignore and continue
      }
    }
    return payload;
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const path = request.url;
    
    // Only log API routes (mirrors Express behavior)
    if (path.startsWith('/api')) {
      const duration = Date.now() - ((request as any).startTime || Date.now());
      const method = request.method;
      const statusCode = reply.statusCode;
      
      let logLine = `${method} ${path} ${statusCode} in ${duration}ms`;
      
      // Add JSON response if captured (mirrors Express logging)
      if ((request as any).responsePayload) {
        logLine += ` :: ${JSON.stringify((request as any).responsePayload)}`;
      }
      
      // Truncate log lines to prevent log spam (200 chars, same as Express)
      if (logLine.length > 200) {
        logLine = logLine.slice(0, 199) + "…";
      }
      
      log(logLine);
    }
  });

  log('✅ Request logging configured (with JSON response capture)');

  // ============================================================================
  // HEALTH CHECK ROUTE
  // ============================================================================
  
  fastify.get('/api/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      status: 'ok',
      server: 'fastify',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      middleware: {
        cors: true,
        bodyParsing: true,
        sessions: true,
        logging: true,
      }
    };
  });

  log('✅ Core middleware setup complete');

  // ============================================================================
  // PHASE 3: AUTHENTICATION
  // ============================================================================

  // Register Auth0 JWT verification plugin
  const auth0Domain = process.env.VITE_AUTH0_DOMAIN || process.env.AUTH0_DOMAIN;
  const auth0Audience = process.env.VITE_AUTH0_AUDIENCE || process.env.AUTH0_AUDIENCE || 'https://api.fallowl.com';
  
  if (!auth0Domain) {
    throw new Error('AUTH0_DOMAIN or VITE_AUTH0_DOMAIN environment variable is required');
  }

  log(`🛡️ Configuring Auth0 with domain: ${auth0Domain}, audience: ${auth0Audience}`);

  await fastify.register(import('fastify-auth0-verify'), {
    domain: auth0Domain,
    audience: auth0Audience,
    secret: undefined, // Use JWKS for verification
  });

  log('✅ Auth0 JWT verification configured');

  // Add requireAuth decorator for route protection
  fastify.decorate('requireAuth', async function requireAuthFastify(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const auth = (request as any).user;
      
      if (!auth || !auth.sub) {
        return reply.code(401).send({ message: "Not authenticated" });
      }

      const auth0UserId = auth.sub;
      const email = auth['https://app.com/email'] || auth.email || '';
      let username = auth['https://app.com/name'] || auth.name || auth.nickname || '';
      
      if (!username || username.trim() === '') {
        if (email) {
          username = email.split('@')[0];
        } else {
          username = `user_${auth0UserId.split('|')[1] || auth0UserId}`;
        }
      }

      // Import storage (will be injected)
      const { storage } = await import('./storage');
      let user = await storage.getUserByAuth0Id(auth0UserId);
      
      if (!user) {
        const firstName = auth.given_name || username;
        const lastName = auth.family_name || '';
        
        try {
          user = await storage.createUser({
            auth0Id: auth0UserId,
            email,
            username,
            firstName,
            lastName,
            password: '',
            role: auth['https://app.com/roles']?.[0] || 'user'
          });
        } catch (createError: any) {
          if (createError.code === '23505' && createError.constraint === 'users_auth0_id_unique') {
            user = await storage.getUserByAuth0Id(auth0UserId);
          } else {
            throw createError;
          }
        }
      }

      if (!user) {
        return reply.code(500).send({ message: "Failed to create or retrieve user" });
      }

      // Set userId on request (now properly typed via module augmentation)
      request.userId = user.id;
      request.auth0UserId = auth0UserId;
      
      // Resolve tenant for the user
      const membership = await storage.ensureDefaultTenant(user.id);
      request.tenantId = membership.tenantId;
      request.tenantRole = membership.role;
    } catch (error: any) {
      console.error('Auth helper error:', error);
      return reply.code(500).send({ message: "Authentication error" });
    }
  });

  log('✅ Authentication decorators configured');

  // ============================================================================
  // PHASE 4: RATE LIMITING
  // ============================================================================

  // Register rate limit plugin globally
  await fastify.register(import('@fastify/rate-limit'), {
    global: false, // We'll apply per-route
    max: 300,
    timeWindow: '15 minutes'
  });

  log('✅ Rate limiting configured');

  // ============================================================================
  // PHASE 6: WEBSOCKET INTEGRATION
  // ============================================================================

  // NOTE: WebSocket is handled by the standalone WebSocketServer in websocketService.ts
  // which is initialized via wsService.initialize(server) in index.ts.
  // Do NOT register @fastify/websocket here as it would conflict with the standalone
  // WebSocketServer (causing "server.handleUpgrade() was called more than once" errors).
  // The standalone implementation provides Auth0 JWT verification, user-to-client
  // mapping, heartbeat, and broadcast capabilities.

  log('✅ WebSocket will be handled by standalone WebSocketServer');

  // ============================================================================
  // PHASE 7: ERROR HANDLER
  // ============================================================================

  fastify.setErrorHandler((error, request, reply) => {
    const status = error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    
    console.error('Fastify error:', error);
    reply.code(status).send({ message });
  });

  log('✅ Error handler configured');

  // ============================================================================
  // ROUTE REGISTRATION - Migrated Fastify Routes
  // ============================================================================
  
  await fastify.register(import('./plugins/authRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/profileRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/parallelDialerRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/activityRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/billingRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/callsRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/contactsRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/messagesRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/recordingsRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/rolesRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/settingsRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/twilioRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/usersRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/voicemailsRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/leadsRoutes'), { prefix: '/api' });
  await fastify.register(import('./plugins/supportRoutes'), { prefix: '/api' });
  
  await fastify.register(import('./plugins/extensionRoutes'), { prefix: '/api' });
  log('✅ Chrome Extension API routes registered');
  
  log('✅ All Fastify route plugins registered');

  return fastify;
}

// Initialize and start Fastify server
export async function startFastifyServer() {
  try {
    const fastify = await createFastifyServer();

    const port = 5000;
    const host = '0.0.0.0';

    await fastify.listen({ port, host });
    
    log(`✅ Fastify server running on http://${host}:${port}`);
    log(`   Health check: http://localhost:${port}/api/health`);
    
    return fastify;
  } catch (error) {
    log(`❌ Error starting Fastify server: ${error}`);
    process.exit(1);
  }
}
