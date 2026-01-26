# Simplification Plan

## 1. Consolidate and Simplify Twilio Hooks

**Current State:**
- Multiple hooks exist: `useTwilioDevice.ts`, `useTwilioDeviceSimple.ts`, `useTwilioDeviceV2.ts`.
- `useTwilioDeviceV2.ts` contains a complex singleton class `TwilioDeviceManager` mixed with React hook logic.
- Business logic (Parallel Dialer specific handling) is coupled with the generic device driver.

**Plan:**
1.  **Cleanup:** Delete `useTwilioDevice.ts` and `useTwilioDeviceSimple.ts` as they appear unused (verified by search).
2.  **Extract Logic:** Move the `TwilioDeviceManager` class out of `useTwilioDeviceV2.ts` into a dedicated library file `client/src/lib/twilio/DeviceManager.ts`.
3.  **Decouple:** Remove hardcoded Parallel Dialer API calls (like `/api/dialer/call-rejected`) from the `DeviceManager`. Instead, expose events (e.g., `onIncomingCall`) that the consuming component (Parallel Dialer) can subscribe to and handle the specific business logic.
4.  **Simplify Hook:** Rewrite `useTwilioDevice` (renaming V2) to be a thin wrapper around the `DeviceManager`, focusing solely on exposing state and methods to React components.

## 2. Refactor `ParallelDialerPage.tsx`

**Current State:**
- A single file with ~1300 lines.
- Mixes complex state management, WebSocket event handling, and UI rendering.
- Hard to maintain and test.

**Plan:**
1.  **Extract Custom Hooks:**
    -   `useParallelDialerState`: Manage the complex state (lines, queue, stats, dialing status).
    -   `useParallelDialerEvents`: Encapsulate the WebSocket event listeners and their state updates.
2.  **Extract UI Components:**
    -   `components/dialer/DialerHeader.tsx`: Title and status badges.
    -   `components/dialer/DialerControls.tsx`: Start/Stop/Pause buttons and list selection.
    -   `components/dialer/DialerSettings.tsx`: The collapsible settings panel.
    -   `components/dialer/DialerQueue.tsx`: The scrollable list of queued contacts.
    -   `components/dialer/ActiveLinesPanel.tsx`: The grid of active call cards.
    -   `components/dialer/CompletedCallsPanel.tsx`: The list of finished calls.
    -   `components/dialer/DialerStats.tsx`: The statistics cards.

## 3. Clean up `server/twilioService.ts`

**Current State:**
- Contains deprecated methods (`loadCredentialsFromDatabase`, etc.) that just log warnings.
- Mixes global singleton pattern with per-user credential logic.

**Plan:**
1.  **Remove Deprecated Code:** Delete `loadCredentialsFromDatabase`, `initialize`, and `reloadCredentialsFromDatabase`.
2.  **Clarify Responsibility:** Ensure the service focuses on stateless operations where possible, or clearly separates the global configuration from per-request/per-user operations.

## 4. Execution Order

1.  **Server Cleanup:** Start with `server/twilioService.ts` as it's the safest change.
2.  **Client Cleanup:** Delete unused hooks.
3.  **Device Manager Refactor:** Extract `DeviceManager` and update `useTwilioDeviceV2`.
4.  **Page Refactor:** Iteratively extract components from `ParallelDialerPage.tsx`, starting with the UI components, then moving to the logic hooks.
