# Authentication Fix & Multi-tenant Foundation Implementation Plan

## 1. Database Schema & Multi-tenant Foundation (COMPLETED)
- [x] Fixed `shared/schema.ts` to include unique constraints for settings (per-tenant keys).
- [x] Ensured user indexes are correctly set for authentication lookups.
- [x] Verified table relationships for multi-tenant isolation.

## 2. Storage Layer Refactoring (COMPLETED)
- [x] Removed redundant `userId` parameters from tenant-scoped storage methods in `server/storage.ts`.
- [x] Cleaned up `warnIfTenantScopedParamsInvalid` calls to strictly enforce tenant isolation.
- [x] Verified and updated methods for Leads, Recordings, Settings, and Call Notes to use `tenantId` as the primary isolation key.

## 3. Custom Authentication System Implementation

### Phase 1: Security & Session Core
- [x] Install dependencies: `fastify-session`, `fastify-cookie`, `bcryptjs`.
- [x] Implement secure credential hashing and verification in `server/auth.ts`.
- [x] Configure session storage and middleware in `server/fastify.ts`.

### Phase 2: Backend Auth API
- [x] Implement `POST /api/register` with validation.
- [x] Implement `POST /api/login` with session creation.
- [x] Implement `POST /api/logout` and `GET /api/user` (profile).

### Phase 3: Auth Infrastructure Integration
- [x] Create `requireAuth` and `requireTenant` decorators.
- [x] Replace Auth0 decorators across all existing routes.
- [x] Implement tenant-context injection middleware.

### Phase 4: Frontend Authentication UI
- [x] Build the `AuthPage` component (Login/Register).
- [x] Implement authentication forms with Zod validation.
- [x] Create multi-tenant onboarding UI for first-time login.

### Phase 5: Auth Provider Transition
- [x] Update frontend `auth.tsx` (use-auth.tsx) context to use local API.
- [x] Handle protected routing and redirection logic.
- [x] Implement session persistence and auto-login.
- [x] Verify Phase 5 configurations and dependencies.

### Phase 6: Hardening & Cleanup
- [x] Remove all Auth0 related code and environment variables.
- [x] Implement rate limiting on auth endpoints.
- [x] Final security audit of session management and cookie security.

## 4. Multi-tenant Infrastructure Hardening (NEXT PHASE)
- [x] Implement middleware to automatically inject `tenantId`.
- [ ] Add audit logging for cross-tenant access attempts.

## 5. Deployment & Configuration (FINAL PHASE)
- [ ] Set up `SESSION_SECRET` as a mandatory secret.
- [ ] Conduct final production environment verification.
