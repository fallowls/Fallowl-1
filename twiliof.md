# Twilio Multi-Tenant Configuration Guide

This document outlines the multi-phased approach to implementing and fixing Twilio configuration within a multi-tenant environment.

## Phase 1: Database & Schema Preparation
- **Credential Storage**: Ensure the `users` or `tenants` table has encrypted fields for `twilioAccountSid`, `twilioAuthToken`, `twilioApiKeySid`, `twilioApiKeySecret`, and `twilioPhoneNumber`.
- **Tenant Isolation**: Verify that `tenantId` is present in all Twilio-related tables (`calls`, `messages`, `recordings`) to ensure data isolation.
- **Settings Table**: Use a tenant-scoped `settings` table for global Twilio preferences like `auto_record_calls`.

## Phase 2: Service Layer Refactoring
- **UserTwilioService**: Implementation of `UserTwilioClientCache` to manage per-user/per-tenant Twilio clients.
- **Credential Recovery**: Logic to fetch credentials based on the active session's `userId` or `tenantId`.
- **TwiML App Management**: Automatic creation and validation of TwiML Applications per tenant to handle WebRTC calls.
- **Webhook Security**: Implementation of signed webhook verification to ensure requests originate from Twilio.

## Phase 3: Middleware & Context
- **Tenant Identification**: Middleware to extract `tenantId` from request headers or subdomains.
- **AsyncLocalStorage**: Using `AsyncLocalStorage` to persist the `tenantId` throughout the request lifecycle, ensuring all database queries are automatically scoped.

## Phase 4: Route & Controller Updates
- **Credential Endpoints**: CRUD operations for managing Twilio credentials, ensuring only authorized users can modify tenant settings.
- **Dynamic Webhooks**: Routes like `/api/twilio/voice` must dynamically resolve the tenant/user based on query parameters or custom headers provided by Twilio.
- **Token Generation**: Endpoints to generate scoped Access Tokens for the Twilio Voice SDK.

## Phase 5: Verification & Monitoring
- **Automatic Verifier**: A background service to periodically check if TwiML App webhooks are correctly configured and point to the current deployment URL.
- **Connection Diagnostics**: Health check endpoints to verify the validity of stored Twilio credentials.
- **Error Handling**: Robust retry logic and logging for API failures.

## Multi-Tenant Best Practices
- **Never Hardcode**: Always use `process.env.REPLIT_DOMAINS` or centralized URL config for webhooks.
- **Encrypt Secrets**: Use the `encryption.ts` utility for all stored Twilio tokens.
- **Scope Queries**: Every database call must include a `where(eq(table.tenantId, currentTenantId))` clause.
