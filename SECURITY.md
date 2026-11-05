# EARTH ONE SECURITY & PRIVACY DIRECTIVE

## 1. Geographic Privacy & Sovereign Consent
- **No Unsolicited Precision Tracking**: Earth One strictly forbids broadcasting or plotting high-precision GPS coordinates without explicit affirmative user consent.
- **Granular Visibility**: Citizens choose whether their node is visible on the 3D globe. Turning off location hides coordinates instantly.
- **City-Level Resolution**: By default, nodes are anchored to urban centers (e.g. Beijing, Amman, San Francisco, Riyadh, Paris, Saint Petersburg) rather than residential streets.

### Public profile and session responses
- Public user lists, profiles, and global search must use an explicit field allowlist; never expose account email or internal onboarding state.
- When location sharing is disabled, public responses must not contain the stored latitude/longitude. Keep the city/country label and `isPublic` flag for existing profile UI compatibility.
- `/api/auth/me` and `/api/auth/current` must return only the account associated with a valid bearer token; without a valid session, return `user: null`.
- Onboarding, profile updates, and location-visibility changes require a valid bearer session; location privacy changes must be persisted atomically.

## 2. API Key Protection
- All generative AI API calls (Google Gemini 2.5) are executed server-side via `/api/ai/*`.
- Client requests never receive or store the raw `GEMINI_API_KEY`.

## 3. Communication Safeguards
- End-to-end conversation isolation.
- Rate limiting on post and message creation to prevent automated spam.
- User blocking and content reporting mechanism infrastructure in database schema.


## 4. Desktop Browser privacy and selective clearing

- The desktop-only **Privacy / Clear browsing data** panel lists the local Browser categories separately and requires a second confirmation. Time ranges are available only for timestamped browsing history and download-history records; bookmarks, session-restore snapshots, in-memory permission grants, and the current Browser session's site data are cleared as whole categories because those stores do not have a safe, consistent per-record timestamp.
- Browsing history and bookmarks are stored in the Browser's local data file. Download-history clearing removes only terminal metadata records; it never cancels active downloads and never deletes downloaded files or user-created PDFs. Session-restore clearing disables the opt-in setting and removes only the URL snapshot. Permission clearing revokes this-run grants and denies pending requests.
- Site-data clearing uses the dedicated, non-persistent `earth-one-browser` Chromium session—not EARTH ONE's app/default session. It explicitly clears the Browser session's cookies, cache, file systems, IndexedDB, local storage, service workers, WebSQL and background fetch data, and clears its HTTP-auth cache when supported. Current Browser tabs are safely unloaded, cleared, and restored; any tab that cannot be restored is reported. See Electron's [Session API](https://www.electronjs.org/docs/latest/api/session) for the clearing APIs.
- The operation is local-only: it does not upload cleared content, touch `server_data.json`, user accounts, Library data, archived articles, app-origin storage, downloaded files, or unselected categories. A malformed or unreadable local store enters read-only protection rather than being overwritten. Ordinary Web fallback behavior is unchanged and does not expose this desktop panel.
