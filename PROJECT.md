# PlinkoVibe v2

A world-class browser Plinko game with custom physics, WebGL rendering, procedural audio, and server-authoritative outcomes.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite 6, PixiJS v8 (WebGL), Tailwind CSS 4 |
| **Physics** | Custom engine (~250 lines TS) running in a Web Worker |
| **Audio** | Web Audio API — procedural position-based pitch shifting |
| **Backend** | Express 5, SQLite (better-sqlite3), Zod, Helmet, Pino |
| **Monorepo** | npm workspaces (shared, backend, frontend) |
| **Node** | 22 LTS (required for `import.meta.dirname`) |

## Architecture

- **Server-authoritative**: Backend predetermines slot outcomes via `crypto.randomBytes()` weighted sampling
- **Integer-cent arithmetic**: All money stored as cents internally, converted to dollars at API boundary
- **Custom physics with bias**: Ball paths look natural but are guided toward predetermined slots via subtle correction forces
- **Object pooling**: Pre-allocated balls, particles, and glow sprites — zero GC during gameplay
- **Provably fair**: Server seed hash + nonce stored per round (exposure planned for v1.1)

## Project Structure

```
plinko-v2/
├── shared/          # TypeScript API contract types
│   └── src/types.ts
├── backend/         # Express + SQLite server
│   └── src/
│       ├── index.ts       # Server entry, middleware, health check
│       ├── db.ts          # SQLite init, schema, WAL mode
│       ├── logger.ts      # Pino logger
│       ├── store.ts       # Session/history CRUD (Phase 3)
│       ├── routes/        # API routes (Phase 3)
│       └── plinko/        # Outcome engine, paytables (Phase 3)
├── frontend/        # React + PixiJS + Tailwind
│   └── src/
│       ├── App.tsx        # Root layout + PixiJS canvas
│       ├── api.ts         # API client (Phase 3)
│       ├── components/    # UI components (Phase 5)
│       ├── plinko/        # Physics, board layout, playback (Phase 2)
│       ├── sound/         # Procedural audio system (Phase 4)
│       └── renderer/      # Particles, glow, shake, pools (Phase 4)
├── data/            # SQLite database (gitignored)
└── package.json     # Root monorepo config
```

## Development

```bash
nvm use 22
npm install
npm run dev          # Starts shared watcher + backend + frontend concurrently
npm run typecheck    # Type-checks all 3 workspaces
npm run test         # Runs vitest in frontend + backend
npm run build        # Production build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- Health check: http://localhost:4000/api/health
- Vite proxies `/api/*` to the backend automatically

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/session` | Create session ($1000 starting balance) |
| GET | `/api/config?sessionId=` | Paytables + game config |
| POST | `/api/plinko/bet` | Place bet(s), resolve outcomes |
| GET | `/api/balance?sessionId=` | Current balance |
| GET | `/api/history?sessionId=&limit=` | Bet history |

## Build Phases

1. **Project Scaffolding** — Monorepo, servers, PixiJS canvas, Tailwind *(done)*
2. **Core Game Loop** — Custom physics, Web Worker, PixiJS renderer, playback system
3. **Backend API + Integration** — SQLite store, outcome engine, paytables, API routes
4. **Game Feel / Juice** — Procedural audio, particles, glow, screen shake, win popups
5. **Features** — Controls panel, stats, auto-bet, keyboard shortcuts, responsive layout
6. **Polish & Accessibility** — Object pools, error handling, a11y, reduced motion support

## Key Differentiators

- **Position-based peg sounds**: Pitch scales with row (800Hz top → 2000Hz bottom), creating a natural ascending scale as balls descend
- **Tiered landing feedback**: Sound, particles, and screen shake all scale with win multiplier
- **Custom physics**: Lightweight (~250 lines) vs Matter.js (~700 lines in v1), runs entirely off main thread
- **WebGL rendering**: PixiJS v8 auto-batches sprites into minimal draw calls

## Environment Variables

See `.env.example` for all options. Defaults work for local development.
