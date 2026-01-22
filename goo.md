# Project Fixes and Issues Log - January 22, 2026

## 1. Database & Storage Issues
- **Issue**: `ON CONFLICT` error in `setSetting` method in `server/storage.ts`.
- **Detail**: The `settings` table lacks the expected unique constraint on `(tenant_id, key)` that Drizzle's `onConflictDoUpdate` expects.
- **Fix Applied**: 
    - Executed SQL to add a unique constraint to the `settings` table: `ALTER TABLE settings ADD CONSTRAINT settings_tenant_key_unique UNIQUE (tenant_id, key);` (Completed Jan 22, 2026)
    - Removed duplicate `initializeDefaultData` implementation in `server/storage.ts`. (Completed Jan 22, 2026)
    - Fixed invalid `updatedAt` reference in `setSetting` ON CONFLICT clause. (Completed Jan 22, 2026)

## 2. Fastify Hook Errors
- **Issue**: `FST_ERR_HOOK_INVALID_ASYNC_HANDLER` in `server/index.ts`.
- **Detail**: Fastify async hooks (like `tenantIdentifier`) are being passed too many arguments or the signature is incorrect (e.g., using `done` with an `async` function).
- **Fix Applied**: Refactored `tenantIdentifier`, `dbConnectionManager`, and `userContext` hooks to follow the correct async signature: `async (request, reply) => { ... }` without the third `done` argument. (Completed Jan 22, 2026)

## 3. Broken Module Imports
- **Issue**: `ERR_MODULE_NOT_FOUND` for multiple services.
- **Detail**:
    - `TenantService` vs `tenantService.ts` (Case sensitivity issues).
    - Relative paths in controllers were inconsistent.
- **Fix Applied**: 
    - Standardized service and utility imports across all controllers in `server/api/`. (Completed Jan 22, 2026)
    - Fixed case sensitivity for `tenantService`. (Completed Jan 22, 2026)
    - Corrected relative path depth for deep-nested controllers. (Completed Jan 22, 2026)

## 4. Multi-Tenant Security Alerts
- **Issue**: Unauthorized tenant access attempts detected during startup webhook verification.
- **Detail**: The `verifyAllWebhooks` process is attempting to verify webhooks for users across different tenants without proper membership validation or setup.
- **Status**: PENDING
- **Fix Required**: Update `twilioWebhookVerifier` to handle missing memberships gracefully during startup or ensure the seeding process creates correct memberships first.

## 5. Duplicate Code & LSP Errors
- **Issue**: Multiple "Duplicate function implementation" errors in `server/storage.ts`.
- **Detail**: Files likely became corrupted or over-appended during git sync.
- **Status**: PENDING
- **Fix Required**: Manually clean up `server/storage.ts` to remove duplicate method definitions (e.g., `initializeDefaultData` appearing twice).

## Summary of Pending Tasks

| Task | Location | Description |
| :--- | :--- | :--- |
| **Fix Webhook Verification** | `twilioWebhookVerifier` | Gracefully handle missing memberships during startup verification to avoid unauthorized access alerts. |
| **Storage Cleanup** | `server/storage.ts` | Remove duplicate method definitions (like `initializeDefaultData`) causing LSP errors. |
