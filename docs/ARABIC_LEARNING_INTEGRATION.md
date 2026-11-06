# Arabic Learning Integration

## User intent

Bring the Arabic-learning and library experience described by `jsbs25/rengdeng-student` into EARTH ONE as a distinct module, without replacing EARTH ONE's existing routes, APIs, data, or library.

## Source feature inventory (observed, not copied)

The source README and web interface describe these capability groups:

- **Study content:** categorized Arabic sentences with translations and audio/transliteration; vocabulary and dictionary; grammar lessons; everyday dialogues; Arabic alphabet; Qur'an and related reading material.
- **Practice and progress:** flashcards with spaced repetition, a wordbook, quizzes/challenges, listening/shadowing, daily goals, streaks, study timing, and backup/import.
- **Reading/library:** curated book reading, a large metadata catalogue, Islamic/Arabic studies collections, Chinese classics, search, a reader, bookmarks/annotations, and reading progress.
- **AI/voice and service features:** Arabic tutoring and page analysis; speech recognition and text-to-speech; server-side search/catalogue APIs; separately gated account, quota, payment/unlock and administrative functions.
- **Client/data behavior:** the generated page and many scripts use browser `localStorage`; several reading, search, dictionary, speech and AI actions call the source site's own `/api/*` endpoints. Those endpoints and their service credentials are not portable as a static frontend.

## Rights, privacy, and compatibility boundary

- The source repository's public GitHub metadata reports **no declared license** (`license: null`) and there is no checked-in LICENSE file. Therefore this integration does not copy its source code, styles, images, compiled HTML, datasets, book text, Qur'an/translation editions, hadith, cached OCR, or service responses. The implementation below is independently authored from the high-level feature descriptions.
- The source repository contains multi-megabyte book, sentence, hadith, Qur'an, catalogue and OpenITI/cache files. Their rights are not uniformly established by the repository's top-level license metadata; no underlying full text is transferred. A public URL or downloadable file is not treated as republication permission.
- No source-side `.env`, token/credential file, or file path clearly named for users/students/accounts was found in the tracked-file checks. This is not a complete personal-data audit; accordingly, no source data directory, database, backup, cache, secret, user/student record or payment data is imported.
- The source's paid/credentialed AI, voice, account, payment and operational APIs are not connected. No credentials or user identifiers are migrated.
- EARTH ONE already has an independent `DigitalLibrary`, metadata-first external discovery, rights filters, guarded import paths, EPUB reader and library APIs. This first slice adds a link to that existing module; it does not replace or weaken those safeguards.

## Phased integration plan

### Phase 1 — independent learning entry point (this change)

Add a distinct Arabic-learning tab and deep link. Deliver a real 28-letter practice loop with answer reveal, ratings, spaced scheduling, daily new-card limit, due count, study streak, browser-local progress, alphabet reference cards and optional device-native speech synthesis. Provide a direct handoff to EARTH ONE's existing DigitalLibrary. Study progress remains in this browser's local storage; it is not sent to EARTH ONE's server.

### Phase 2 — licensed learning content and course system

Introduce sentence, vocabulary, grammar, dialogue, quiz and wordbook capabilities using new content that is authored for EARTH ONE or comes from explicitly licensed/open sources. Preserve per-item attribution and license fields; do not import the source repository's datasets until the code/content rights and any source-specific reuse permissions are affirmatively established. Add tests for source attribution, import validation, progress isolation and backup format before enabling cross-device sync.

### Phase 3 — reading, voice and AI learning workflows

Connect study recommendations to the existing metadata-first library and its official-source links. Add Arabic reader enhancements only where they reuse EARTH ONE's existing safe reader APIs and books whose rights are documented. Consider browser speech APIs and the existing AI gateway behind explicit user actions, cost/privacy disclosures, rate limits and failure states. No Qur'an translation/audio, hadith full text, or other protected corpus is rehosted without item-level rights verification.

### Phase 4 — account sync and broader parity

Only after the user-data model and rights review are complete, design opt-in account-backed progress sync, backups/import, reminders and wider course coverage. Keep existing EARTH ONE user, social, library and service data isolated; do not migrate production data or source-site accounts.

## Current implementation status

Phase 1 is the only implemented phase. The rest of the source feature inventory is explicitly deferred; the new module does not claim sentence/vocabulary corpus parity, Qur'an/hadith content transfer, server-side AI tutoring, ASR/TTS service access, account/payment functionality, or cross-device syncing.
