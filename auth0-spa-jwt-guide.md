# How to Get a JWT Access Token in an SPA with Auth0 and PKCE

This guide explains how a Single Page Application (SPA) can securely obtain a JWT access token from Auth0 using the Authorization Code Flow with PKCE. This method is the most secure for SPAs as it does not require a client secret.

## 1. Why this is Secure for SPAs

The Authorization Code Flow with PKCE (Proof Key for Code Exchange) is designed to be secure for public clients like SPAs. Here’s why:

-   **No Client Secret**: The flow doesn't require a client secret to be stored in the browser, which would be easily exposed.
-   **PKCE**: The PKCE mechanism ensures that only the client who initiated the authorization request can exchange the authorization code for an access token. This is achieved by the client creating a secret (`code_verifier`) and a transformed version of it (`code_challenge`) that is sent in the initial authorization request. The `code_verifier` is then sent in the token exchange request, and Auth0 validates it against the `code_challenge`.

## 2. Auth0 Application Settings

Your Auth0 application must be configured as follows:

1.  **Application Type**: `Single Page Application`.
2.  **Allowed Callback URLs**: The URL(s) where Auth0 will redirect the user after they have authenticated. For example, `http://localhost:3000/callback`.
3.  **Allowed Logout URLs**: The URL(s) where Auth0 will redirect the user after they log out. For example, `http://localhost:3000`.
4.  **Allowed Web Origins**: The URL(s) from which your SPA is served. For example, `http://localhost:3000`.
5.  **Token Endpoint Authentication Method**: `None`. This is crucial for SPAs as they cannot securely store a client secret.
6.  **Grant Types**: Ensure `Authorization Code` is enabled.

## 3. Auth0 API Settings

Your Auth0 API must be configured to accept JWTs from your application:

1.  **Identifier (Audience)**: The unique identifier for your API. In your case, `https://api.thecloso.com`.
2.  **Signing Algorithm**: `RS256`. This is the recommended and most secure signing algorithm.
3.  **Allow Offline Access**: This should be enabled in your API settings if you want to request `offline_access` scope to get a refresh token.

## 4. The Authorization Request

The first step is to redirect the user to the Auth0 `/authorize` endpoint. You will need to generate a `code_verifier` and a `code_challenge`.

-   **`code_verifier`**: A cryptographically random string.
-   **`code_challenge`**: A `SHA256` hash of the `code_verifier`, which is then `Base64-URL` encoded.
-   **`code_challenge_method`**: This must be `S256`.

Here is an example of the authorization request:

```http
GET https://<YOUR_AUTH0_DOMAIN>/authorize?
  audience=https://api.thecloso.com&
  scope=openid%20profile%20email%20offline_access&
  response_type=code&
  client_id=<YOUR_CLIENT_ID>&
  redirect_uri=http://localhost:3000/callback&
  code_challenge=<GENERATED_CODE_CHALLENGE>&
  code_challenge_method=S256
```

## 5. The Token Exchange Request

After the user authenticates and is redirected back to your SPA, you will receive an `authorization_code` in the URL. You then need to exchange this code for an access token by making a `POST` request to the `/oauth/token` endpoint.

Here is an example of the token exchange request:

```http
POST https://<YOUR_AUTH0_DOMAIN>/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "client_id": "<YOUR_CLIENT_ID>",
  "code": "<AUTHORIZATION_CODE_FROM_URL>",
  "redirect_uri": "http://localhost:3000/callback",
  "code_verifier": "<ORIGINAL_CODE_VERIFIER>"
}
```

The response from this request will contain the `access_token` (which will be a JWT), `id_token`, and optionally a `refresh_token` if you requested the `offline_access` scope.
