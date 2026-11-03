# EARTH ONE SYSTEM ARCHITECTURE

## 1. Unified Layered Design

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (Vite + React 19)                  │
│                                                                        │
│   ┌─────────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│   │  3D Digital Globe   │  │  Global Social  │  │   EARTH ONE      │   │
│   │   (Three.js PBR,    │  │  Feed & Spatial │  │     AI HUB       │   │
│   │  Arcs, Nodes, Pins) │  │  User Profiles  │  │ (Gemini Gateway) │   │
│   └─────────────────────┘  └─────────────────┘  └──────────────────┘   │
│   ┌─────────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│   │   Instant Chat &    │  │  Creator Hub &  │  │   Game Center    │   │
│   │  AI Auto-Translate  │  │   Video Stream  │  │ (Chess, Gomoku)  │   │
│   └─────────────────────┘  └─────────────────┘  └──────────────────┘   │
│         ▲                         ▲                      ▲             │
│         └─────────────────────────┼──────────────────────┘             │
│                                   ▼                                    │
│                    Unified i18n & RTL Engine (6 Languages)             │
│                    Tailwind CSS v4 Dark Space Design System            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST & Realtime Polling
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 BACKEND SERVICE LAYER (Express + TypeScript)            │
│                                                                        │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│   │   Auth & User    │  │ Post & Social    │  │ Direct Messaging │     │
│   │   Identity Ctrl  │  │ Feed Controller  │  │ & AI Translation │     │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘     │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│   │   Globe Spatial  │  │ Creator Hub &    │  │ Global Game      │     │
│   │  Nodes & Metrics │  │ Articles/Videos  │  │ Lobby & State    │     │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘     │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│   │ AI Hub Gateway   │  │ Ad Network &     │  │ Search & Filter  │     │
│   │ (@google/genai)  │  │ Analytics Engine │  │ Indexing Service │     │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     DATA PERSISTENCE & STORAGE                         │
│   - Unified JSON Database with Atomicity & Schema Validation           │
│   - Structured Tables: Users, Locations, Posts, Messages, Articles,   │
│     Videos, Communities, Games, AI Logs, Ads, Transactions             │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. Key Technology Choices
- **Frontend Framework**: React 19 + TypeScript with strict types and zero hydration errors.
- **3D Engine**: Three.js r187 with procedural textures, atmospheric Rayleigh glow shader, city node instancing, curved cubic bezier data flow arcs, and interactive raycasting.
- **Styling**: Tailwind CSS v4 with dark cosmos palette: `#030712` (deep space void), `#0f172a` (nebula slate), `#06b6d4` (cyan beacon), `#3b82f6` (orbital blue), `#a855f7` (cosmic violet).
- **Backend**: Express + TypeScript with unified API routing, rate limiting, and Gemini 2.5 AI streaming integration.
- **Internationalization**: Native support for English, Chinese, Arabic (with full RTL bidirectional layout), Spanish, French, and Russian.
