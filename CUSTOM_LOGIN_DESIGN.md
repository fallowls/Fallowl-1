# Custom Login and Authentication System Design

This document outlines the design for a custom user authentication system to replace Auth0. The system will be based on email/password credentials and will use JSON Web Tokens (JWTs) for session management.

## 1. User Schema

A `users` table will be created in the `public` schema to store user credentials.

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Each user will be associated with a tenant, but the `users` table itself is in the `public` schema to allow for a centralized login process. The relationship between users and tenants will be managed in a separate `tenant_users` join table.

## 2. Password Management

*   **Hashing:** Passwords will be hashed using a strong, salted hashing algorithm like **Argon2** or **bcrypt**.
*   **Storage:** The hashed password will be stored in the `password_hash` column of the `users` table.

## 3. Authentication Flow

1.  **Registration (`/api/auth/register`):**
    *   The user provides an email and password.
    *   The password is an Hashed.
    *   A new user record is created in the `users` table.
2.  **Login (`/api/auth/login`):**
    *   The user provides an email and password.
    *   The system retrieves the user record by email.
    *   The provided password is an Hashed and compared to the stored `password_hash`.
    *   If the credentials are valid, a JWT is generated and returned to the client.
3.  **Token-Based Authentication:**
    *   For subsequent requests, the client includes the JWT in the `Authorization: Bearer <token>` header.
    *   A middleware validates the JWT. If valid, the user's information is attached to the request object.

## 4. JSON Web Tokens (JWTs)

*   **Payload:** The JWT payload will contain the `userId` and `tenantId`.
*   **Signature:** The JWT will be signed with a strong secret key using a secure algorithm (e.g., HS256).
*   **Expiration:** JWTs will have a short expiration time (e.g., 15 minutes) to enhance security. A refresh token mechanism will be implemented for seamless re-authentication.

## 5. Security Considerations

*   **Password Policy:** Enforce strong password policies on the client-side.
*   **HTTPS:** All communication must be over HTTPS to protect credentials and JWTs in transit.
*   **Secret Management:** The JWT secret key must be stored securely and rotated periodically.
*   **Brute-force Protection:** Implement rate limiting on the login endpoint to prevent brute-force attacks.
