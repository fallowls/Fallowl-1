# Smart Login & Signup System Implementation Plan

This document outlines the detailed multi-phase plan for implementing a modern, "smart" login/signup system that automatically detects user status and provides a seamless, minimal experience.

## Phase 1: Infrastructure & Database Setup
- **Goal**: Establish the foundation for user data and authentication.
- **Tasks**:
    - [x] Create PostgreSQL database using Replit's built-in database tool.
    - [x] Define `users` schema: `id`, `email`, `password_hash`, `full_name`, `created_at`, `is_active`.
    - [x] Set up a backend (Node.js/Express or Python/Flask) to handle API requests.
    - [x] Integrate authentication middleware (e.g., JWT).

## Phase 2: Backend API Development
- **Goal**: Build the logic for email detection and authentication.
- **Tasks**:
    - [x] **Endpoint: `POST /api/check-email`**:
        - Input: `email`.
        - Logic: Query DB for email existence.
        - Output: `{ exists: true/false }`.
    - [x] **Endpoint: `POST /api/login`**:
        - Input: `email`, `password`.
        - Logic: Validate credentials against DB.
        - Output: Auth token or error.
    - [x] **Endpoint: `POST /api/signup`**:
        - Input: `email`, `password`, `full_name`.
        - Logic: Create new user record.
        - Output: Success message and initial token.

## Phase 3: Frontend UI Development (React/Vite)
- **Goal**: Create a modern, minimal UI matching the "consio" style.
- **Tasks**:
    - [x] **Step 1: Email Entry Screen**:
        - Minimalist input field ("Work email").
        - "Continue" button.
        - Auto-focus on input.
    - [x] **Step 2: Conditional Rendering**:
        - If `exists: true`: Show password field and "Forgot Password?" link.
        - If `exists: false`: Show registration fields (Name, Password confirmation).
    - [x] **Animations**: Add smooth transitions between steps (e.g., fade or slide).
    - [x] **Styling**: Use Tailwind CSS for a clean, modern look (neutral colors, rounded corners, subtle shadows).

## Phase 4: Security & Validation
- **Goal**: Ensure the system is robust and secure.
- **Tasks**:
    - [x] Implement password hashing (e.g., bcrypt).
    - [x] Add input validation (email format, password strength).
    - [x] Implement rate limiting on the `check-email` and `login` endpoints to prevent abuse.
    - [x] Securely store JWT tokens in cookies or local storage.

## Phase 5: Testing & Polishing
- **Goal**: Finalize and refine the user experience.
- **Tasks**:
    - [x] Conduct end-to-end testing of the "Smart" flow.
    - [x] Add loading states and error handling (toast notifications).
    - [x] Ensure mobile responsiveness.
    - [x] Final UI polish: shadows, hover states, and typography.
