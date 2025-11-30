# DialPax CRM Platform

## Overview
DialPax is a cloud-based dialer and CRM Single Page Application (SPA) designed to provide a comprehensive platform for managing communication and customer relationships. It integrates features for calls, SMS, contacts, recordings, and system settings, aiming to be a scalable, full-stack solution for businesses. The platform focuses on enhancing business communication, streamlining CRM processes, and offering a robust, secure, and user-friendly experience.

## Recent Changes
- **November 30, 2025**:
  - Added Chrome Extension API endpoints (`/api/ext/*`) for external extension integration
  - Implemented CORS support for `chrome-extension://` origins
  - Added extension-specific rate limiting (100 req/min for general, 30 req/min for calls)
  - Environment variable `CHROME_EXTENSION_IDS` for production extension whitelisting

- **October 26, 2025**: 
  - Fixed production deployment issues for AWS environments
  - Added comprehensive environment variable validation at startup
  - Enhanced error handling for DNS resolution failures (AWS VPC issues)
  - Improved BASE_URL configuration with automatic HTTPS enforcement
  - Fixed Twilio webhook protocol detection for production environments
  - Added database connection testing on startup
  - Created AWS deployment troubleshooting guide (AWS_TWILIO_FIX_GUIDE.md)
  - Removed four features to streamline the platform: Scheduled Calls, Call Scripts, Call Dispositions, and Emails

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
-   **Framework**: React 18 with TypeScript.
-   **UI/UX**: Radix UI with shadcn/ui design system, Tailwind CSS for styling (CSS variables for theming), responsive (mobile-first), dark/light mode, accessibility features.
-   **State Management**: Zustand for global state, TanStack Query for server state.
-   **Form Handling**: React Hook Form with Zod validation.
-   **Build Tool**: Vite.

### Backend
-   **Runtime**: Node.js with Express.js.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **API**: RESTful API with JSON responses.
-   **Session Management**: Express sessions with PostgreSQL store.

### Core Features
-   **Communication**: Dialer (keypad, call status), SMS (threaded), Recordings (management, playback, AI analytics, cost control), Voicemail.
-   **CRM**: Contacts (management, deduplication, phone normalization), Dashboard (statistics, activity), Call Management (mute, hold, notes, on-call UI).
-   **User & System Management**: Users (RBAC, 2FA, subscriptions), Support (ticketing, knowledge base), Profile settings.
-   **Incoming Calls**: Full-featured pop-up with caller info and WebRTC routing.
-   **System Settings**: Twilio integration, call settings, SMTP, Stripe, CDN.

### Design Patterns
-   User-specific `TwilioDeviceManager` for device lifecycle management.
-   Modern React Hook architecture.
-   Consistent branding with DialPax logos and color schemes.

### Security Implementation
-   **Authentication**: Auth0 (OAuth 2.0, JWT tokens - RS256), `express-jwt` middleware, hybrid session management.
-   **Authorization**: Role-based access control, strict tenant isolation (`userId` filtering).
-   **Twilio Webhook Security**: HMAC signature validation and user-scoped tokens.
-   **Data Encryption**: Per-user Twilio credentials encrypted (AES-256-GCM).
-   **Race Condition Prevention**: Active call checks for parallel dialer.
-   **TwiML Security**: Uses Twilio SDK's `VoiceResponse` class for TwiML generation to prevent injection vulnerabilities.

### Parallel Dialer Implementation
-   Utilizes `voiceUrl` webhooks with synchronous Answered Machine Detection (AMD) to connect customers to agents only after human detection. This ensures proper audio paths and handles machine/fax detection by hanging up. WebSockets are used for real-time status updates.
-   **Extended Call Status System**: Supports 14+ call status types, intelligently maps AMD outcomes, provides visual indicators, and includes extended WebSocket event data.
-   **Parallel Dialer Verification & Monitoring System**: Includes features for data integrity validation, AMD performance monitoring, disposition accuracy validation, single-call enforcement verification, resource leak detection, and comprehensive analytics. API endpoints and a dedicated dashboard are available for monitoring.

### Recording Storage with BunnyCDN
-   Automated workflow uploads recordings to BunnyCDN immediately after a call ends and deletes them from Twilio to reduce storage costs.
-   **Implementation**: Database schema tracks migration status. `bunnycdnService` handles uploads (with retries and exponential backoff) and deletions.
-   **Security**: Uses environment variables for credentials and supports token-based authentication with MD5 hashing for secure CDN access via signed URLs (requires `BUNNYCDN_TOKEN_AUTH_KEY`).
-   **Playback Architecture**: Server-proxied playback/download (`/api/recordings/:id/play` and `/api/recordings/:id/download`) ensures secure access without exposing CDN URLs directly to the frontend.

### Chrome Extension API

The platform provides a dedicated API for Chrome extension integration at `/api/ext/*`.

**Authentication**: All endpoints (except `/api/ext/health`) require Auth0 JWT Bearer token.

**CORS**: Chrome extensions are automatically allowed. In production, set `CHROME_EXTENSION_IDS` environment variable with comma-separated extension IDs to whitelist specific extensions.

**Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ext/health` | GET | Health check (no auth) |
| `/api/ext/contacts` | GET | List contacts (paginated) |
| `/api/ext/contacts/search` | GET | Search contacts by query |
| `/api/ext/contacts/:id` | GET | Get single contact |
| `/api/ext/contacts` | POST | Create new contact |
| `/api/ext/contacts/:id` | PUT | Update contact |
| `/api/ext/contacts/:id` | DELETE | Delete contact |
| `/api/ext/twilio/token` | GET | Get Twilio access token for WebRTC |
| `/api/ext/twilio/status` | GET | Get Twilio configuration status |
| `/api/ext/calls/initiate` | POST | Initiate outbound call |
| `/api/ext/calls/:id/hangup` | POST | End active call |
| `/api/ext/calls/:id/mute` | POST | Toggle mute status |
| `/api/ext/calls/:id/hold` | POST | Toggle hold status |
| `/api/ext/calls/active` | GET | Get current active calls |
| `/api/ext/calls/history` | GET | Get call history |
| `/api/ext/user/profile` | GET | Get authenticated user profile |

**Rate Limits**: 100 requests/minute for general endpoints, 30 requests/minute for call operations.

## External Dependencies

-   **Database**: PostgreSQL, Neon Database.
-   **ORM**: Drizzle ORM.
-   **UI Components**: Radix UI, shadcn/ui, Lucide React.
-   **Styling**: Tailwind CSS.
-   **Date Handling**: date-fns.
-   **Payment Processing**: Stripe.
-   **Voice & SMS**: Twilio (Voice SDK, TwiML, API).
-   **Authentication**: Auth0.
-   **CDN Storage**: BunnyCDN.
-   **Utilities**: `libphonenumber-js`.