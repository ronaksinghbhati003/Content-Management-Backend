# Content Management Backend

Production-ready REST API powering **CreatorCMS** — a content planning, AI-assisted
generation, and multi-platform publishing system for creators (YouTube, Instagram).

Built with Express + TypeScript on a module-per-feature architecture, MongoDB via
Mongoose, JWT-based auth, and a background scheduler for automated publishing.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js, TypeScript |
| Framework | Express 5 |
| Database | MongoDB (Mongoose) |
| Auth | JWT (`jsonwebtoken`), `bcrypt` password hashing |
| Validation | Zod |
| AI | Google Gemini (`@langchain/google-genai`) — content generation, thumbnails, chat, research |
| Video pipeline | `yt-dlp` (external binary) + `ffmpeg` (`@ffmpeg-installer/ffmpeg`, bundled) |
| Image processing | `sharp` |
| Scheduling | `node-cron` — background publish job runner |
| Logging | `winston` |
| API docs | `swagger-jsdoc` + `swagger-ui-express` |
| Security | `helmet`, `cors`, `compression` |

## Project Structure

```
src/
├── server.ts              # Process entry point — starts HTTP server, DB connection, scheduler
├── app.ts                 # Express app assembly (middleware, routes, error handling)
├── routes/                # Top-level router — mounts every module under /api/v1
├── config/                 # Env config, MongoDB connection, Winston logger, Swagger spec
├── middlewares/            # Auth (bearer/access token), validation, error handling, request logging
├── shared/                 # ApiResponse envelope, HttpException classes, async handler wrapper
├── utils/                  # Password hashing, JWT sign/verify
└── modules/                 # One folder per feature, each with its own
    │                        # *.route.ts / *.controller.ts / *.service.ts / *.schema.ts (Mongoose)
    │                        # / *.z.schema.ts (Zod validation)
    ├── Auth/                # User accounts: register/login, profile, password, notification &
    │                        # theme preferences, account deletion
    ├── device-register/     # Device registration — issues the initial Bearer token used to log in
    ├── ai/                  # Gemini-backed: chat, multi-step content plan generation, title
    │                        # suggestions, thumbnail image generation, script rewrite/highlights,
    │                        # topic research
    ├── content/             # Content library CRUD (the general content items)
    ├── series/               # Series planner CRUD
    ├── roadmap/              # Roadmap/planning board CRUD
    ├── upload/               # Video/thumbnail file uploads
    ├── editor/               # Clip editor: create project, transcribe, render
    ├── publish/              # YouTube/Instagram OAuth connect, publish job creation, background
    │                        # execution (clip download via yt-dlp, vertical conversion via
    │                        # ffmpeg, upload to platform), job status polling & retry, YouTube
    │                        # cookie management, publish scheduler (node-cron)
    ├── analytics/            # Platform analytics aggregation
    ├── common/                # Small shared endpoints (e.g. soft-delete)
    └── health/                # Health check endpoint
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance (local or Atlas)
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) installed and on `PATH` (or point `YT_DLP_PATH` at
  the binary) — required for the publish module's clip-download pipeline
- `ffmpeg` — bundled automatically via `@ffmpeg-installer/ffmpeg`, no separate install needed

### Install & Run

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run dev             # starts on http://localhost:3040 (nodemon, ts-node)
```

Other scripts:

```bash
npm run build   # tsc → dist/
npm start        # node dist/server.js (run the build)
npm run lint      # tsc --noEmit
```

### Environment Variables

See `.env.example` for the full list. Grouped by concern:

| Group | Variables |
|---|---|
| Server | `PORT`, `NODE_ENV`, `SERVER_BASE_URL`, `LOG_LEVEL` |
| Database | `MONGO_URI` |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN`, `HASH_SALT_ROUND` |
| AI | `GEMINI_API_KEY`, `GROQ_API_KEY` |
| YouTube | `YOUTUBE_API_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, `YT_DLP_PATH` |
| Meta / Instagram | `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` |

`SERVER_BASE_URL` must be a URL reachable from the public internet (not `localhost`) in any
environment where Instagram's Graph API needs to fetch generated media — e.g. a tunnel URL in dev.

## Authentication Flow

1. **`POST /api/v1/device/register`** — registers the calling device and returns a **Bearer token**.
2. That Bearer token authenticates **`POST /user/login`** or **`POST /user/register`**, which return
   an **Access token**.
3. Every other protected route requires `Authorization: Access <token>` and is enforced by
   `accessTokenMiddleware` (mounted globally in `routes/index.ts`, ahead of all feature routers
   except `/device`, `/user`, and the public publish OAuth callbacks).

## API Overview

Base path: `/api/v1`. Full interactive documentation (request/response schemas, try-it-out) is
served at **`/api-docs`** (raw OpenAPI JSON at `/api-docs.json`).

| Module | Base path | Responsibility |
|---|---|---|
| Auth | `/user` | Register, login, profile, password, notification/theme prefs, account deletion |
| Device | `/device` | Device registration (issues Bearer token) |
| AI | `/ai` | Chat, content-plan generation, title suggestions, thumbnail generation, script rewrite/highlights, research |
| Content | `/content` | Content library CRUD |
| Series | `/series` | Series planner CRUD |
| Roadmap | `/roadmap` | Planning board CRUD |
| Upload | `/upload` | Video/thumbnail uploads |
| Editor | `/editor` | Clip editor projects: create, transcribe, render |
| Publish | `/publish` | YouTube/Instagram connect + OAuth callback, publish job create/list/get/delete/retry, cookie management |
| Analytics | `/analytics` | Platform analytics |
| Common | `/common` | Shared utility endpoints (e.g. soft-delete) |
| Health | `/health` | Liveness check |

## Background Jobs

A `node-cron` scheduler (`modules/publish/publish.scheduler.ts`) runs every minute, picks up
publish jobs whose `scheduledAt` has passed, and executes them: downloads the source clip via
`yt-dlp`, optionally converts it to a vertical 9:16 canvas via `ffmpeg` (face-aware crop, powered
by Gemini vision), then uploads to the target platform(s). On server restart, any job left mid-flight
is reset to `failed` so it can be retried from the UI.

## Logging

Structured JSON logs via Winston, written to `logs/` (`combined.log`, `error.log`) and to the
console in dev. Request logging middleware records method/URL/status/duration for every request.
