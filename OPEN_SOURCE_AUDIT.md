# OPEN SOURCE AUDIT & ARCHITECTURAL REFERENCE

This document tracks audits of reference open source projects specified in Chapter 18 for EARTH ONE.

| Project | Repository | License | Tech Stack | Suitability & Integration Strategy |
|---|---|---|---|---|
| **Three Globe** | `vasturiano/three-globe` | MIT | Three.js, WebGL | **Primary 3D Reference**: Used for spherical coordinates, geo-arc interpolations, country boundary rings, and glowing pulse shaders. |
| **OpenBook** | `PromoAI07/OPENBOOK` | MIT / GPL | React, Node | **Social Logic Reference**: Evaluated for post schema, comment tree hierarchies, and notification dispatching. |
| **Ocelot Social** | `Ocelot-Social-Community/Ocelot-Social` | AGPL-3.0 | Vue / GraphQL / Neo4j | **Reference Only**: Clean community and moderation patterns, but heavy stack. Logic adapted into modular TypeScript. |
| **Movim** | `movim/movim` | AGPL-3.0 | PHP / XMPP | **Chat Concept Reference**: Decentralized pubsub and multi-user chat room paradigms. |
| **Globestudio** | `alevizio/globestudio` | MIT | Three.js | **Atmosphere & Lighting Reference**: Evaluated for starfield depth, atmospheric Rayleigh scattering rim light. |
| **LiteLLM / Open WebUI** | `BerriAI/litellm` | MIT | Python/TS | **AI Hub Gateway Pattern**: Unified payload format, provider fallback routing, token counting, and prompt templates. |

## License Compliance Matrix

All integrated libraries in EARTH ONE operate under permissive MIT, Apache 2.0, or BSD licenses. No AGPL viral code is directly bundled into client binaries.
