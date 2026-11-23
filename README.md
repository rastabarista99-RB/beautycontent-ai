# BeautyContent AI

AI marketing assistant for beauty businesses, backed by PostgreSQL, Prisma ORM, and Docker.

## Prerequisites

- Docker & Docker Compose
- Node.js 22+ and npm (if running Next.js directly on host)

## Standard PostgreSQL Docker settings

- **Image**: `postgres:16`
- **Host / Port**: `localhost:5432`
- **User**: `postgres`
- **Password**: `postgres`
- **Database**: `postgres`

## Quick start

1. Copy `.env.example` to `.env` and set `AUTH_SECRET` plus your AI key (`OPENAI_API_KEY` or `GEMINI_API_KEY` with `AI_PROVIDER=gemini`):

   ```bash
   cp .env.example .env
   ```

2. Start PostgreSQL with Docker Compose:

   ```bash
   docker compose up -d
   ```

3. Install dependencies, apply Prisma migrations, seed the demo client, and start the app:

   ```bash
   npm install
   npm run db:setup
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).
   Demo client login created by seed: `demo@beautycontent.local` / `DemoPassword123!`.
