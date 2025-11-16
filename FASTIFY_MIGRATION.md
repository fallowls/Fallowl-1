# Fastify Migration Progress

## Overview
Migrating from Express to Fastify for improved performance and better TypeScript support.
- **Total Routes**: 214
- **Migrated**: 4 auth routes
- **Remaining**: 210 routes

## Completed Work

### Phase 1: Foundation ✓
- Verified @fastify/middie bridge working
- Both Fastify and Express routes running side-by-side
- Routing precedence: Fastify routes take priority over Express

### Phase 2: Middleware Conversion ✓
- **Rate Limiters**: `server/plugins/rateLimiters.ts`
  - Configured all 7 rate limit policies (api, auth, strict, webhook, download, sms, call)
- **Twilio Webhook Validator**: `server/plugins/twilioWebhookValidator.ts`
  - Handles signature validation and user identification
- **Auth0 JWT**: Already configured in `server/fastify.ts`
- **requireAuth decorator**: Already configured in `server/fastify.ts`

### Phase 3: Authentication Routes ✓
- Migrated 4 routes in `server/plugins/authRoutes.ts`:
  - POST /api/auth/login
  - POST /api/auth/logout
  - GET /api/auth/me
  - POST /api/auth/auth0-session

## Migration Pattern

### Creating a Route Plugin
```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storage } from '../storage';
import { rateLimitConfigs } from './rateLimiters';

export default async function domainRoutes(fastify: FastifyInstance) {
  // Use RELATIVE paths (prefix is added when registering)
  fastify.get('/resource', {
    config: {
      rateLimit: rateLimitConfigs.api  // Apply rate limiting
    },
    preHandler: async (request, reply) => {
      // Auth check
      await request.jwtVerify();
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Handler logic
    return reply.send({ data: [] });
  });
}
```

### Registering the Plugin
In `server/fastify.ts`:
```typescript
await fastify.register(import('./plugins/domainRoutes'), { prefix: '/api' });
```

## Remaining Routes by Domain

### Phase 4: Profile & User Management (30 routes)
- `/api/profile` - GET, PUT (profile management)
- `/api/profile/password` - PUT (password change)
- `/api/profile/notifications` - PUT (notification settings)
- `/api/profile/avatar` - POST (avatar upload)
- `/api/users` - GET, POST (user CRUD)
- `/api/users/:id` - GET, PUT, DELETE
- `/api/users/search` - GET
- `/api/users/bulk-update` - POST
- `/api/users/:id/activity` - GET
- `/api/users/:id/login-history` - GET
- `/api/users/:id/invoices` - GET
- `/api/roles` - GET, POST (role management)
- `/api/roles/:id` - PUT, DELETE

### Phase 5: Contacts & Lists (40 routes)
- `/api/contacts` - GET, POST
- `/api/contacts/:id` - GET, PUT, DELETE
- `/api/contacts/search` - GET
- `/api/contacts/:id/notes` - GET, POST
- `/api/contacts/import` - POST
- `/api/contacts/export` - GET
- `/api/contact-lists` - GET, POST
- `/api/contact-lists/:id` - GET, PUT, DELETE
- `/api/contact-lists/:id/members` - GET, POST, DELETE

### Phase 6: Communications - Calls, SMS, Webhooks (60 routes)
- `/api/calls` - GET, POST
- `/api/calls/:id` - GET
- `/api/calls/:id/notes` - POST
- `/api/sms` - GET, POST
- `/api/sms/:id` - GET
- `/api/sms/templates` - GET, POST, PUT, DELETE
- `/api/sms/campaigns` - GET, POST
- `/api/twilio-webhooks/*` - Multiple webhook handlers
- `/api/recordings` - GET, DELETE
- `/api/voicemail` - GET, DELETE

### Phase 7: Leads & Billing (55 routes)
- `/api/leads` - GET, POST
- `/api/leads/:id` - GET, PUT, DELETE
- `/api/leads/:id/activities` - GET, POST
- `/api/leads/:id/tasks` - GET, POST
- `/api/leads/scoring` - GET, POST
- `/api/subscription-plans` - GET, POST, PUT
- `/api/invoices` - GET, POST

### Phase 8: Utilities & Misc (25 routes)
- `/api/settings` - GET, POST
- `/api/twilio/config` - GET, POST, PUT
- `/api/analytics/*` - Various analytics endpoints
- `/api/reports/*` - Report generation

## Testing Strategy

### Per-Domain Testing
1. Use `fastify.inject()` for unit tests
2. Compare Express vs Fastify responses during transition
3. Test rate limiting behavior
4. Verify authentication/authorization works

### Regression Testing
- Keep Express routes active during migration
- Test both endpoints to ensure parity
- Monitor production logs for errors

## Next Steps

1. **Fix Session Sharing** (Critical)
   - Ensure Express app reuses Fastify session middleware
   - This will fix current Auth0 session errors

2. **Create Shared Helpers**
   - requireAuth preHandler wrapper
   - Role-based access control helpers
   - Schema validation utilities

3. **Migrate by Domain**
   - Start with Profile & User Management (highest priority)
   - Then Contacts & Lists
   - Then Communications
   - Finally Leads & Billing

4. **Cutover**
   - Once all routes migrated and tested
   - Remove @fastify/middie bridge
   - Delete Express routes.ts
   - Performance benchmarking

## Current Issues

1. **Session Error**: Express routes getting undefined session
   - Need to share session middleware between Fastify and bridged Express app
   
2. **Route Precedence**: Need to verify Fastify routes take precedence
   - Test that migrated routes use Fastify handlers, not Express

## Success Criteria

- ✓ All 214 routes migrated to Fastify
- ✓ No Express dependencies remaining
- ✓ All tests passing
- ✓ Performance improvement demonstrated
- ✓ Zero downtime migration completed
