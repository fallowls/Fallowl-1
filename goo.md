# Project Fixes and Issues Log - January 22, 2026

## 1. Database & Storage Issues
- **Issue**: `ON CONFLICT` error in `setSetting` method in `server/storage.ts`.
- **Detail**: The `settings` table lacks the expected unique constraint on `(tenant_id, key)` that Drizzle's `onConflictDoUpdate` expects.
- **Fix Applied**: Executed SQL to add a unique constraint to the `settings` table: `ALTER TABLE settings ADD CONSTRAINT settings_tenant_key_unique UNIQUE (tenant_id, key);` (Completed Jan 22, 2026)

## 2. Fastify Hook Errors
- **Issue**: `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` in `server/index.ts`.
- **Detail**: Fastify async hooks (like `tenantIdentifier`) are being passed too many arguments or the signature is incorrect (e.g., using `done` with an `async` function).
- **Fix Required**: Refactor `tenantIdentifier`, `dbConnectionManager`, and `userContext` hooks in `server/middleware/` (or wherever defined) to follow correct async signature: `async (request, reply) => { ... }`.

## 3. Broken Module Imports
- **Issue**: `ERR_MODULE_NOT_FOUND` for multiple services.
- **Detail**:
    - `TenantService` vs `tenantService.ts` (Case sensitivity issues).
    - Relative paths in `server/api/auth/auth.controller.ts` were incorrect (`../services/` instead of `../../services/`).
- **Fix Required**: Audit all controllers in `server/api/` and ensure imports match the actual file system casing and depth.

## 4. Multi-Tenant Security Alerts
- **Issue**: Unauthorized tenant access attempts detected during startup webhook verification.
- **Detail**: The `verifyAllWebhooks` process is attempting to verify webhooks for users across different tenants without proper membership validation or setup.
- **Fix Required**: Update `twilioWebhookVerifier` to handle missing memberships gracefully during startup or ensure the seeding process creates correct memberships first.

## 5. Duplicate Code & LSP Errors
- **Issue**: Multiple "Duplicate function implementation" errors in `server/storage.ts`.
- **Detail**: Files likely became corrupted or over-appended during git sync.
- **Fix Required**: Manually clean up `server/storage.ts` to remove duplicate method definitions (e.g., `initializeDefaultData` appearing twice).
