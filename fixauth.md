# Authentication Fix & Multi-tenant Foundation Implementation Plan

## 1. Database Schema & Multi-tenant Foundation (COMPLETED)
- [x] Fixed `shared/schema.ts` to include unique constraints for settings (per-tenant keys).
- [x] Ensured user indexes are correctly set for authentication lookups.
- [x] Verified table relationships for multi-tenant isolation.

## 2. Storage Layer Refactoring (NEXT PHASE)
- [ ] Remove redundant `userId` parameters from tenant-scoped storage methods in `server/storage.ts`.
- [ ] Clean up `warnIfTenantScopedParamsInvalid` calls to strictly enforce tenant isolation.
- [ ] Optimize reporting queries (like `getLeadStats`) for better multi-tenant performance.

## 3. Custom Authentication System (NEXT PHASE)
- [ ] **Auth Strategy**: Implement local session-based authentication using `fastify-session`.
- [ ] **Backend Implementation**:
    - [ ] Create `server/auth.ts` for credential hashing (scrypt) and session management.
    - [ ] Replace Auth0 decorators in `server/fastify.ts` with local `requireAuth`.
    - [ ] Implement endpoints: `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/user`.
- [ ] **Frontend Implementation**:
    - [ ] Create `client/src/pages/auth-page.tsx` using Tailwind/Shadcn UI.
    - [ ] Update `client/src/lib/auth.tsx` (if exists) or `App.tsx` to handle local auth state.
    - [ ] Implement "Login with Tenant" flow to associate users with their organization on first sign-in.

## 4. Multi-tenant Infrastructure Hardening (NEXT PHASE)
- [ ] Implement middleware to automatically inject `tenantId` from the authenticated user into all request objects.
- [ ] Add audit logging for cross-tenant access attempts.
- [ ] Update seeding logic to create a separate default tenant for the admin user.

## 5. Deployment & Configuration (FINAL PHASE)
- [ ] Remove all Auth0 environment variable requirements.
- [ ] Set up `SESSION_SECRET` as a mandatory secret.
- [ ] Conduct a final security audit of the session management implementation.
