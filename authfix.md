# Auth0 Authentication Fix Guide

## Problem Summary
The application is experiencing 401 Unauthorized errors because the Auth0 Audience (`https://api.thecloso.com`) is not properly registered in your Auth0 dashboard. This causes "Service not found" errors during login and token acquisition.

## Permanent Fixes (Auth0 Dashboard)

### 1. Register the API
Go to **Applications** -> **APIs** -> **Create API**:
- **Name**: Closo API (or any name)
- **Identifier**: `https://api.thecloso.com` (This MUST match the `VITE_AUTH0_AUDIENCE` env var)
- **Allow Offline Access**: Ensure this toggle is **ON** (required for `offline_access` scope).

### 2. Update Application Settings
Go to **Applications** -> **DialPax CRM** (or your app name):
- **Allowed Callback URLs**: `https://374f4fea-3e77-47fa-8c6a-cb424b3188d6-00-s1ydshbyfhxe.pike.replit.dev`
- **Allowed Web Origins**: `https://374f4fea-3e77-47fa-8c6a-cb424b3188d6-00-s1ydshbyfhxe.pike.replit.dev`
- **Allowed Logout URLs**: `https://374f4fea-3e77-47fa-8c6a-cb424b3188d6-00-s1ydshbyfhxe.pike.replit.dev`
- **Refresh Token Rotation**: Ensure this is **Enabled**.

## Current Temporary Workaround
I have temporarily **removed the audience requirement** from the application code. This allows you to:
1.  Log in using basic Auth0 authentication.
2.  Access the CRM features using session-based authentication fallback.

**Note**: Advanced API features that require a specific audience-scoped JWT may still throw 401s until the API is registered in your dashboard.

## Verification Steps
1. Logout and log back in.
2. You should see a successful login without the "Service not found" error.
3. Once logged in, the CRM should load your profile normally.
