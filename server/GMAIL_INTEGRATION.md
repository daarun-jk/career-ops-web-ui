# Gmail API Integration Documentation

This document explains the changes made to `career-ops` to support creating draft emails directly in Gmail via their API, bypassing unreliable frontend deep links.

## Why this change was made
Previously, clicking "Draft in Gmail" generated a deep-link URL (`view=cm`) to open a new Gmail tab. This approach was unreliable when managing multiple Gmail accounts in the browser and failed to actually save the draft silently in the background. 

We replaced this with a robust backend integration using Google's official `googleapis` library.

## What Changed

### 1. Backend (`server/index.js` & `server/package.json`)
- **Dependencies Installed:** 
  - `googleapis` (To communicate with Google APIs)
  - `nodemailer` (Specifically `nodemailer/lib/mail-composer` to easily construct valid RFC 2822 raw email strings required by the Gmail API)
  - `marked` (To convert Markdown text into HTML so links are clickable in the draft)
- **OAuth Setup:** 
  - Initialized an `OAuth2` client using `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` from `.env`.
  - Added token persistence: Once authenticated, the token is saved to `server/config/gmail_token.json` so you don't have to login repeatedly.
- **New Endpoints:**
  - `GET /api/gmail/status`: Checks if a valid `gmail_token.json` exists.
  - `GET /api/gmail/auth`: Generates a Google Login URL and redirects the user to it.
  - `GET /api/gmail/oauth2callback`: The redirect URL Google hits after login. It exchanges the code for a token and saves it.
  - `POST /api/gmail/draft`: Receives `{ to, subject, body }`. It uses `marked` to render the Markdown body to HTML (preserving line breaks), compiles it using `nodemailer`, and calls the `gmail.users.drafts.create` API to silently create the draft.

### 2. Frontend (`frontend/src/components/Dashboard.jsx`)
- **State Management:** Added `isGmailConnected` state. On load, the frontend hits `/api/gmail/status` to determine what the button should do.
- **Button Logic:**
  - Replaced the old deep-link logic with a new `saveGmailDraft(emailText, toAddress)` function.
  - If NOT connected, clicking the button opens `/api/gmail/auth` in a new tab to authenticate.
  - If connected, clicking the button hits the `/api/gmail/draft` endpoint.
  - The predicted email format (`contactsResult?.emailFormat`) is automatically passed to the backend so the "To:" field is pre-filled!

---

## Setup Instructions for a New Machine

If you ever need to set this up on a new machine, or if someone else clones this repo, they must follow these steps to get their own API credentials.

### 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a **New Project**.
3. Search for **"Gmail API"** and click **Enable**.

### 2. Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Choose **External** and click **Create**.
3. Fill in the App name and your email in the required fields. Click **Save and Continue**.
4. Skip "Scopes".
5. In **"Test users"**, click **Add Users** and type the exact Gmail address you plan to use. *If you skip this, you will get an Error 403 Access Denied.*

### 3. Generate Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **+ CREATE CREDENTIALS** -> **OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized redirect URIs**, add: `http://localhost:3000/api/gmail/oauth2callback`
5. Click **Create** and copy your Client ID and Client Secret.

### 4. Environment Variables
Add them to `server/.env`:
```env
GMAIL_CLIENT_ID="your-client-id"
GMAIL_CLIENT_SECRET="your-client-secret"
```

Start the app, click **Connect Gmail**, and you're good to go!
