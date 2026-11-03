# EARTH ONE SECURITY & PRIVACY DIRECTIVE

## 1. Geographic Privacy & Sovereign Consent
- **No Unsolicited Precision Tracking**: Earth One strictly forbids broadcasting or plotting high-precision GPS coordinates without explicit affirmative user consent.
- **Granular Visibility**: Citizens choose whether their node is visible on the 3D globe. Turning off location hides coordinates instantly.
- **City-Level Resolution**: By default, nodes are anchored to urban centers (e.g. Beijing, Amman, San Francisco, Riyadh, Paris, Saint Petersburg) rather than residential streets.

## 2. API Key Protection
- All generative AI API calls (Google Gemini 2.5) are executed server-side via `/api/ai/*`.
- Client requests never receive or store the raw `GEMINI_API_KEY`.

## 3. Communication Safeguards
- End-to-end conversation isolation.
- Rate limiting on post and message creation to prevent automated spam.
- User blocking and content reporting mechanism infrastructure in database schema.
