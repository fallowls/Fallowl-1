# Authentication Fix & Custom Implementation Plan

## 1. Database Schema & Multi-tenant Foundation
- [ ] Fix `shared/schema.ts` constraints to allow unique settings per tenant.
- [ ] Ensure `users` table has necessary fields for custom authentication (username/password/salt).
- [ ] Validate `tenants` and `tenant_memberships` structures for proper isolation.

## 2. Storage Layer Refactoring
- [ ] Clean up `server/storage.ts` to remove redundant `userId` parameters in tenant-scoped methods.
- [ ] Fix `getLeadStats` and other reporting methods to correctly scope by `tenantId`.
- [ ] Implement robust error handling for database operations.

## 3. Custom Authentication Implementation
- [ ] Create `server/auth.ts` for session-based authentication logic.
- [ ] Replace Auth0 dependency in `server/fastify.ts` with local session strategy.
- [ ] Implement login, logout, and register endpoints.
- [ ] Create a custom `requireAuth` decorator for Fastify routes.

## 4. Frontend Custom Login Page
- [ ] Create `client/src/pages/auth-page.tsx` with a professional login/register UI.
- [ ] Update `client/src/App.tsx` routes to protect authenticated paths.
- [ ] Connect frontend forms to the new backend auth endpoints.

## 5. Seeding & Data Initialization
- [ ] Fix `server/seedData.ts` to handle ON CONFLICT scenarios correctly.
- [ ] Ensure admin user creation uses the custom password strategy.
- [ ] Verify multi-tenant data seeding works without cross-tenant leakage.

## 6. Testing & Validation
- [ ] Verify application starts without Auth0 errors.
- [ ] Test login/logout flow manually.
- [ ] Verify tenant data isolation.
