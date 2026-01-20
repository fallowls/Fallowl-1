# Auth0 401 Error Resolution Plan

## Issue Description
The application is throwing a **401 Unauthorized** error: `{"message":"No Authorization was found in request.headers"}`. This occurs because API requests are being made without a valid JWT token in the Authorization header.

## Root Causes
1.  **Callback URL Mismatch**: Auth0 is unable to complete the login handshake because the current environment URL (`http://127.0.0.1:5000`) is not whitelisted in the Auth0 Dashboard.
2.  **Missing Authorization Headers**: The frontend `apiRequest` utility or TanStack Query fetcher is not correctly extracting and attaching the Auth0 access token to outgoing requests.
3.  **Audience Configuration**: If the `audience` in the frontend Auth0 provider doesn't match the backend expectation, the token will be invalid or missing scopes.

## Detailed Fix Steps

### 1. Auth0 Dashboard Configuration (User Action Required)
- [ ] Log in to [Auth0 Dashboard](https://manage.auth0.com/).
- [ ] Navigate to **Applications** > **Settings**.
- [ ] Add `http://127.0.0.1:5000` to **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**.
- [ ] Ensure the **API Audience** matches the `VITE_AUTH0_AUDIENCE` env var.

### 2. Frontend Authorization Injection
- [ ] **Verify `client/src/lib/queryClient.ts`**: Ensure `apiRequest` is updated to include `headers: { Authorization: 'Bearer ${token}' }`.
- [ ] **Verify `client/src/hooks/useAuth.ts`**: Ensure `getAccessTokenSilently` is being called before API requests.

### 3. Environment Variable Audit
- [ ] Check `VITE_AUTH0_DOMAIN`
- [ ] Check `VITE_AUTH0_CLIENT_ID`
- [ ] Check `VITE_AUTH0_AUDIENCE`

### 4. Backend Validation
- [ ] Ensure `server/fastify.ts` (or equivalent) is correctly using the `fastify-auth0-verify` plugin with the correct secret/domain.
