# Enterprise-Grade Multi-Tenant SaaS API Architecture

This document outlines a robust, secure, and scalable multi-tenant SaaS architecture designed for programmatic API interaction, eliminating traditional user-facing login pages. The core focus is on strict tenant data isolation, high availability, and comprehensive security.

## 1. Tenant Identification Mechanism

For identifying tenants on each API request, we will use a hybrid approach combining **API Keys** with a **Custom Domain** strategy for enterprise-level tenants.

**Primary Strategy: API Keys**

*   **Mechanism:** Each tenant is issued a unique, cryptographically secure API key. The client must include this key in the `Authorization` header with the `Bearer` scheme on every request.
    ```
    Authorization: Bearer <tenant_api_key>
    ```
*   **Advantages:**
    *   **Stateless:** Each request is self-contained and carries its own authentication information.
    *   **Explicit & Secure:** The `Authorization` header is the standard and expected place for credentials.
    *   **Flexible:** Keys can be easily rotated, revoked, and managed per-tenant or even per-client within a tenant.

**Secondary Strategy: Custom Domains (for Enterprise Tenants)**

*   **Mechanism:** Enterprise tenants can be assigned a custom subdomain (e.g., `acme.api.yourservice.com`). The tenant is identified based on the subdomain, and API key authentication is still required.
*   **Advantages:**
    *   **Branding:** Provides a branded experience for enterprise customers.
    *   **Network-Level Isolation:** Can be used for network-level routing and isolation.

## 2. Request Pipeline & Authorization Middleware

The request pipeline is a series of middleware functions that process each incoming request before it reaches the business logic.

**Middleware Chain:**

1.  **Tenant Identification Middleware**
2.  Per-Tenant Rate Limiting Middleware
3.  Request Body Parsing Middleware
4.  Business Logic / Route Handler

**Detailed Steps:**

1.  **Extract Tenant Identifier:**
    *   The middleware inspects the `Authorization` header and the request's hostname.
    *   It parses the `Authorization` header to extract the token from the `Bearer <tenant_api_key>` string.
    *   If a custom domain is used, the subdomain is extracted from the hostname.

2.  **Validate Identifier:**
    *   The extracted API key is used to look up the tenant in a `tenants` database table. The lookup is optimized by first identifying the tenant via the subdomain if present.
    *   The `tenants` table contains: `id`, `api_key_hash`, `status`, and `custom_domain`.
    *   To prevent timing attacks, a constant-time comparison function is used to compare the provided key with the stored hash.

3.  **Inject Tenant Context:**
    *   Once the tenant is validated, the unique `tenant_id` is attached to the request object and stored in an `AsyncLocalStorage` context for use in downstream services.

## 3. Data Isolation Strategy

### Database Level: Row-Level Security (RLS) with a Shared Database, Separate Schema Approach

We will use a shared database with a separate schema for each tenant. This provides a higher level of isolation than a simple `tenant_id` column.

*   **Schema Management:**
    *   A `public` schema contains common tables (e.g., `tenants`).
    *   Upon tenant creation, a new schema (e.g., `tenant_abc_123`) is created, and all tenant-specific tables are created within it.
*   **Querying:**
    *   The application sets the `search_path` for the database connection to the tenant's schema at the beginning of each request.
    *   This ensures all subsequent queries are automatically routed to the correct tenant's tables.

### Storage Level (Amazon S3)

We will use a **bucket-per-tenant** strategy for enterprise tenants and a **folder-per-tenant** strategy for others.

*   **Strategy:**
    *   Enterprise tenants get their own S3 bucket for maximum isolation and custom policies.
    *   Other tenants have their files stored in a shared bucket under a `tenant_id` prefix.
*   **Security:** IAM policies and presigned URLs are used to enforce access control.

### Cache Level (Redis)

We will use a separate **Redis database** for each tenant to prevent key collisions.

*   **Strategy:** Redis supports multiple databases (0-15 by default). At the start of each request, the application selects the Redis database corresponding to the tenant's ID (e.g., `SELECT tenant_id_numeric`).

## 4. Security and Operational Considerations

*   **Credential Management:**
    *   **HSM Integration:** For enterprise tenants, API keys can be managed in a Hardware Security Module (HSM) for the highest level of security.
    *   **Key Rotation:** Automated key rotation policies will be enforced.
*   **Rate Limiting & Throttling:**
    *   A sophisticated rate-limiting system with configurable limits based on tenant subscription plans, with support for bursting.
*   **Auditing and Logging:**
    *   Detailed audit logs are stored in a separate, immutable log store (e.g., AWS CloudTrail).
    *   Logs include the `tenant_id`, source IP, and a full record of the operation performed.
*   **Preventing Enumeration Attacks:**
    *   Use non-sequential, non-guessable UUIDs for tenant identifiers.
    *   Return generic `403 Forbidden` errors for all failed authentication attempts.

## 5. Implementation Example (Node.js / Fastify)

```typescript
// server/middleware/tenantIdentifier.ts
// ... (code to extract API key and subdomain)

// server/db.ts
// ... (code to set search_path based on tenant_id)

// server/routes/someRoute.ts
// ... (business logic, transparently queries tenant's schema)
```
