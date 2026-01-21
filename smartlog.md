# Smart Login & Signup System Implementation Plan

This document outlines the detailed multi-phase plan for implementing a modern, "smart" login/signup system that automatically detects user status and provides a seamless, minimal experience.

## Phase 1: Infrastructure & Database Setup
- **Goal**: Establish the foundation for user data and authentication.
- **Tasks**:
    - [ ] Create PostgreSQL database using Replit's built-in database tool.
    - [ ] Define `users` schema: `id`, `email`, `password_hash`, `full_name`, `created_at`, `is_active`.
    - [ ] Set up a backend (Node.js/Express or Python/Flask) to handle API requests.
    - [ ] Integrate authentication middleware (e.g., JWT).

## Phase 2: Backend API Development
- **Goal**: Build the logic for email detection and authentication.
- **Tasks**:
    - [ ] **Endpoint: `POST /api/check-email`**:
        - Input: `email`.
        - Logic: Query DB for email existence.
        - Output: `{ exists: true/false }`.
    - [ ] **Endpoint: `POST /api/login`**:
        - Input: `email`, `password`.
        - Logic: Validate credentials against DB.
        - Output: Auth token or error.
    - [ ] **Endpoint: `POST /api/signup`**:
        - Input: `email`, `password`, `full_name`.
        - Logic: Create new user record.
        - Output: Success message and initial token.

## Phase 3: Frontend UI Development (React/Vite)
- **Goal**: Create a modern, minimal UI matching the "consio" style.
- **Tasks**:
    - [ ] **Step 1: Email Entry Screen**:
        - Minimalist input field ("Work email").
        - "Continue" button.
        - Auto-focus on input.
    - [ ] **Step 2: Conditional Rendering**:
        - If `exists: true`: Show password field and "Forgot Password?" link.
        - If `exists: false`: Show registration fields (Name, Password confirmation).
    - [ ] **Animations**: Add smooth transitions between steps (e.g., fade or slide).
    - [ ] **Styling**: Use Tailwind CSS for a clean, modern look (neutral colors, rounded corners, subtle shadows).

## Phase 4: Security & Validation
- **Goal**: Ensure the system is robust and secure.
- **Tasks**:
    - [ ] Implement password hashing (e.g., bcrypt).
    - [ ] Add input validation (email format, password strength).
    - [ ] Implement rate limiting on the `check-email` and `login` endpoints to prevent abuse.
    - [ ] Securely store JWT tokens in cookies or local storage.

## Phase 5: Testing & Polishing
- **Goal**: Finalize and refine the user experience.
- **Tasks**:
    - [ ] Conduct end-to-end testing of the "Smart" flow.
    - [ ] Add loading states and error handling (toast notifications).
    - [ ] Ensure mobile responsiveness.
    - [ ] Final UI polish: shadows, hover states, and typography.
