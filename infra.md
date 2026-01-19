# Infrastructure Issues Scan - January 19, 2026

## Authentication Issues
1. **Auth0 Callback URL Mismatch**: The application is configured to redirect to `http://127.0.0.1:5000` or the Replit dev domain, but these URLs are not consistently whitelisted in the Auth0 Application Settings.
2. **Missing JWT Audience Verification**: Some routes might not be strictly verifying the `aud` (audience) claim, or there's a mismatch between `https://api.fallowl.com` and the actual environment.
3. **Session Store Schema**: The `session` table for `connect-pg-simple` might be missing or not fully compatible with the Fastify migration requirements if `createTableIfMissing: true` fails.
4. **DNS Resolution for Auth0**: Logs show `getaddrinfo ENOTFOUND auth.fallowl.com`, indicating that the custom domain for Auth0 is not resolving or configured correctly in the environment.

## Multi-tenant Infrastructure Issues
1. **Missing `tenant_id` Column**: Fixed in `shared/schema.ts` for the `settings` table. 
2. **Tenant Isolation**: Currently, some queries in `storage.ts` do not strictly enforce `tenant_id` filters, potentially allowing cross-tenant data access.
3. **Default Tenant Logic**: The `ensureDefaultTenant` function relies on a hardcoded sequence that may fail if the initial `tenants` table isn't populated correctly.

## Twilio & External Integration Issues
1. **Twilio Authentication Failures**: Logs show `Verification failed: Authenticate` for certain users, indicating invalid or expired Twilio credentials in the database.
2. **Webhook URL Consistency**: Twilio webhooks are being updated to match the current Replit domain, but the transition from Express to Fastify might have changed the route handling for signature verification.
3. **WebSocket Connection Failures**: Browser logs show persistent 1006 disconnects. This is likely due to a mismatch between the Vite HMR client and the Fastify WebSocket plugin/standalone server setup on Replit.

## Database & Schema
1. **Drizzle Push Synchronization**: Successfully pushed updates for `tenant_id` in `settings` table.
2. **Column Type Mismatches**: Potential issues with `serial` vs `integer` references across tenant-related tables.
