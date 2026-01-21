# Auth0 Authentication Fix Guide

## Problem Summary
The application is experiencing 401 Unauthorized errors because Auth0 is not issuing refresh tokens. This prevents the client from obtaining a valid access token after the initial one expires or if the user refreshes the page.

## Required Auth0 Dashboard Changes

### 1. Update Application Settings
Go to **Applications** -> **DialPax CRM** (or your app name):
- **Allowed Callback URLs**: `https://374f4fea-3e77-47fa-8c6a-cb424b3188d6-00-s1ydshbyfhxe.pike.replit.dev`
- **Allowed Web Origins**: `https://374f4fea-3e77-47fa-8c6a-cb424b3188d6-00-s1ydshbyfhxe.pike.replit.dev`
- **Allowed Logout URLs**: `https://374f4fea-3e77-47fa-8c6a-cb424b3188d6-00-s1ydshbyfhxe.pike.replit.dev`
- **Refresh Token Rotation**: Ensure this is **Enabled**.

### 2. Update API Settings
Go to **Applications** -> **APIs** -> **https://api.thecloso.com** (or your API audience):
- **Allow Offline Access**: Ensure this toggle is **ON** (required for `offline_access` scope).

## Implementation Details

### Client-side Changes
The `Auth0Provider` in `client/src/main.tsx` is already configured with:
- `useRefreshTokens={true}`
- `cacheLocation="localstorage"`
- `scope="openid profile email offline_access"`

### Server-side Changes
The server is migrated to **Fastify** using `fastify-auth0-verify`. It validates the JWT from the `Authorization: Bearer <token>` header.

### Fallback Mechanism
If the JWT is missing (e.g., during extension requests or initial load), the server falls back to session-based authentication if a valid session exists in the PostgreSQL store.

## Verification Steps
1. Logout and log back in.
2. Check the browser console for "Token retrieved successfully".
3. Verify that requests to `/api/profile` return a 200 OK.
4. If "missing_refresh_token" error persists, verify the **Allow Offline Access** setting in the Auth0 API dashboard.
