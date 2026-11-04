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
