# BeautyContent AI

Initial Phase 01 foundation for the BeautyContent AI PWA.

## Prerequisites

- Node.js 20.9 or newer
- npm

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and configure Supabase plus one generation provider. Set `AI_PROVIDER=gemini` with `GEMINI_API_KEY` to use Gemini, or `AI_PROVIDER=openai` with `OPENAI_API_KEY` to use OpenAI. If `AI_PROVIDER` is unset, generation continues to use OpenAI.

3. Start the development server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

Gemini generation uses Google's Gemini API and the `gemini-3.5-flash-lite` model. Free-tier availability and rate limits apply. This integration does not configure paid billing, tools, or external actions.
