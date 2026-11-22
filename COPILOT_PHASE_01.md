# Copilot Phase 01 — Project Foundation

Paste the prompt below into GitHub Copilot Agent Mode in an empty VS Code workspace.

---

You are the lead software engineer for a new SaaS PWA called **BeautyContent AI**.

Read `PROJECT_BLUEPRINT.md` first and treat it as the source of truth.

## Goal of this task

Create the initial production-ready project foundation only. Do not implement the whole product yet.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth / Postgres / Storage foundation
- OpenAI Responses API integration will be added in a later phase
- PWA foundation
- Vercel deployment target

## Important

Before changing files:
1. Inspect the workspace.
2. Confirm the Node.js/npm environment available.
3. Summarize what you will create.
4. Do not make destructive changes to unrelated files.

## Build in this phase

1. Create the Next.js App Router project structure.
2. Configure TypeScript strict mode.
3. Configure Tailwind CSS.
4. Add the Poppins font using the framework's supported font mechanism.
5. Create the design tokens from `PROJECT_BLUEPRINT.md`.
6. Create the shared UI primitives:
   - Button
   - Input
   - Textarea
   - Select
   - Card
   - Badge
   - Modal/Dialog
   - Toast
   - Skeleton
   - EmptyState
7. Create the app shell:
   - desktop sidebar
   - responsive mobile header
   - mobile bottom navigation
8. Add route placeholders for:
   - `/`
   - `/login`
   - `/register`
   - `/forgot-password`
   - `/business/setup`
   - `/dashboard`
   - `/create`
   - `/create/result`
   - `/projects`
   - `/projects/[id]`
   - `/business`
   - `/settings`
9. Add `app/manifest.ts` with BeautyContent AI branding.
10. Add a minimal service worker foundation in `public/sw.js`.
11. Add `.env.example` with the variables from the blueprint.
12. Add a clean README explaining how to run the project locally.

## Do NOT build yet

- Supabase authentication flow
- Database integration
- OpenAI calls
- Payments
- Social posting
- Analytics
- CRM
- Image generation

## Quality requirements

- No `any` unless justified.
- No hard-coded API keys.
- No client-side OpenAI secret.
- Reuse shared components.
- Avoid unnecessary dependencies.
- Accessible buttons/forms with labels.
- Responsive from 320px mobile width upward.

## Verification

After implementation:
1. run typecheck
2. run lint
3. run production build
4. fix all errors
5. report exactly which files were created/modified
6. report any remaining warnings

Do not continue to Phase 02 until Phase 01 is clean.
