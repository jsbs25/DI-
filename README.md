# EARTH ONE (一颗地球 · 一个世界 · 一个人类)

> **THE NEXT GENERATION GLOBAL DIGITAL WORLD**
> **ONE EARTH. ONE WORLD. ONE HUMANITY.**

EARTH ONE is a unified, global digital ecosystem that integrates geographic visualization, interactive 3D planetary exploration, worldwide social networking, multilingual instant messaging with AI auto-translation, a global creator and video hub, cross-border multiplayer games, and a multi-model AI Hub.

---

## 🌟 Core Features

- 🌍 **Interactive 3D Digital Globe**: Built with Three.js featuring real spherical coordinate mapping, country borders, city nodes, glowing arcs of human connection, day/night procedural shading, atmospheric Rayleigh rim glow, and camera flight.
- 👥 **Global Social Network**: Authentic posts across 5 feeds (Global, Following, Trending, Latest, By Country), media sharing, like/clap reactions, nested comments, and follow relationships.
- 💬 **Global Instant Messaging**: 1-on-1 direct messaging, public global channels, country rooms, and **real-time AI translation** (e.g. Chinese ⇄ English ⇄ Arabic ⇄ Spanish ⇄ French ⇄ Russian) with toggleable original text.
- 🌐 **Deep Multilingual & RTL Support**: Full native support for English, Chinese (中文), Arabic (العربية with complete Right-To-Left layout and typography), Spanish (Español), French (Français), and Russian (Русский).
- ✍️ **Creator Hub & Voluntary Tipping**: Long-form publishing, markdown editor, reader appreciation tips, and creative portfolio display.
- 🎥 **Video Stream Center**: Curated short and long-form video stories from global creators.
- ♟️ **Global Game Center**: Interactive online Chess, Gomoku (Five-in-a-Row), and Global Trivia Challenge.
- 🧠 **EARTH ONE AI HUB**: Multi-model gateway powered by Google Gemini for polyglot translation, creative writing, text summarization, and international language practice.
- 🌌 **Universe Engine**: High-fidelity celestial simulation with 10 physical bodies (Sun, Mercury, Venus, Earth with Moon, Mars, Jupiter, Saturn with Cassini division rings, Uranus, Neptune).
- 🔥 **Live Simulated Trending Topics**: Real-time planetary discussion velocity widget with interactive topic filtering and global telemetry pulse.
- 💎 **Premium Dark Cosmos Aesthetic**: Apple-inspired clean UI, translucent glassmorphic HUD dock, crisp typography, and responsive mobile layout.

---

## 🚀 Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Start full-stack development server
npm run dev

# 3. Build for production
npm run build

# 4. Run automated integrity test suite
npx tsx scripts/test_earth_one.ts

# 5. Run isolated HTTP API privacy and authorization regression tests
npm run test:api
```

Both test suites use temporary, isolated JSON data files and remove them after completion; they do not modify the persistent `server_data.json`. The integrity suite verifies store/domain behavior; the API suite starts a temporary Express server and checks key identity/privacy routes. Neither suite tests browser end-to-end behavior.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Three.js
- **Backend**: Express, TypeScript, tsx, REST API, JSON database with schema validation
- **AI Intelligence**: `@google/genai` (Gemini 2.5 Flash / Pro)
- **3D Engine**: Three.js with custom procedural textures, Raycasting, and spherical kinematics
