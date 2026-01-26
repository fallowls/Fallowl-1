# Voicemail Implementation Plan

This plan outlines the steps to implement a robust voicemail system using Twilio Programmable Voice, integrated into the existing multi-tenant architecture.

## 1. Database Schema Updates

We need to enhance the existing `voicemails` table and potentially the `recordings` table to support advanced voicemail features.

### 1.1 Update `voicemails` Table
- Add `transcription` (text) column for voicemail-to-text.
- Add `transcriptionStatus` (text) column (pending, processing, completed, failed).
- Add `recordingSid` (text) column to link to Twilio recording.
- Add `duration` (integer) column (already exists, but ensure it's populated).
- Add `isRead` (boolean) column (already exists).
- Add `isArchived` (boolean) column.
- Add `tags` (text[]) column for organization.

### 1.2 Update `recordings` Table (if used for voicemail storage)
- Ensure `recordingSource` can distinguish between 'call-recording' and 'voicemail'.

## 2. Backend API Implementation

### 2.1 Voicemail Management Endpoints (`server/routes.ts` or new controller)
- `GET /api/voicemails`: List voicemails with filtering (read/unread, archived).
- `GET /api/voicemails/:id`: Get single voicemail details.
- `PUT /api/voicemails/:id`: Update status (read/unread, archive).
- `DELETE /api/voicemails/:id`: Delete voicemail (and remove from Twilio/Storage).
- `GET /api/voicemails/:id/play`: Stream voicemail audio (securely).
- `GET /api/voicemails/:id/transcript`: Get or request transcription.

### 2.2 Twilio Webhook Handlers (`server/routes.ts`)
- `POST /api/twilio/voice/voicemail`: TwiML to record voicemail.
  - Play greeting.
  - `<Record>` verb with `transcribe=true` and `action` callback.
- `POST /api/twilio/voice/voicemail-action`: Handle recording completion.
  - Save voicemail metadata to DB.
- `POST /api/twilio/voice/transcription`: Handle transcription callback.
  - Update voicemail record with transcription text.

## 3. TwiML Flow Design

### 3.1 Incoming Call Logic
- Modify existing `/api/twilio/voice` webhook.
- If call is not answered (busy/no-answer/timeout):
  - Redirect to `/api/twilio/voice/voicemail`.

### 3.2 Voicemail Recording Flow
1. **Greeting**: Play standard or custom greeting.
2. **Record**: Use `<Record>` verb.
   - `maxLength`: 120 seconds.
   - `playBeep`: true.
   - `transcribe`: true.
   - `transcribeCallback`: `/api/twilio/voice/transcription`.
   - `action`: `/api/twilio/voice/voicemail-action`.

## 4. Frontend Implementation

### 4.1 Voicemail Page (`client/src/pages/VoicemailPage.tsx`)
- **List View**: Display voicemails with caller ID, duration, date, transcription preview.
- **Player**: Audio player for playback.
- **Transcription**: Show full transcription if available.
- **Actions**: Mark as read, archive, delete, call back.

### 4.2 Notifications
- Real-time notification (WebSocket) when new voicemail arrives.
- Badge count on sidebar/menu.

## 5. Storage & Retention

- **Storage**: Initially store on Twilio, but migrate to BunnyCDN (existing pattern) for cost optimization.
- **Retention**: Implement cleanup policy (e.g., delete after 30 days or archive).

## 6. Implementation Steps

1.  **Database Migration**: Create/Update schema for voicemails.
2.  **Backend Routes**: Implement API endpoints and Twilio webhooks.
3.  **TwiML Logic**: Update incoming call flow to route to voicemail on no-answer.
4.  **Frontend UI**: Enhance `VoicemailPage.tsx` with new features (transcription, player).
5.  **Testing**: Verify flow from incoming call -> voicemail -> DB -> UI.
