# BeautyContent AI — Project Blueprint v1.0

## 1. Product

**Name:** BeautyContent AI  
**Format:** Web App + PWA  
**Initial niche:** Beauty salons  
**MVP goal:** A salon owner can register, describe their business, choose a marketing goal and content type, generate AI content, edit it, save it, and copy/download it.

## 2. Product principle

BeautyContent AI is not positioned as a generic text generator. It is an AI marketing assistant for a beauty business.

Core flow:

`Business profile → Marketing goal → Content type → AI generation → Edit → Save`

## 3. MVP scope

### Included
- Landing page
- Registration / login
- Initial business onboarding
- Dashboard
- Business profile
- Services management
- Content generator
- AI result editor
- Project library
- Project detail
- Settings
- PWA manifest and service worker foundation
- Server-side OpenAI integration
- Supabase Auth + Postgres + Storage foundation
- Row Level Security (RLS)
- Loading / error / empty states
- Responsive desktop/tablet/mobile UI

### Explicitly excluded from MVP
- Social media publishing
- Payments/subscriptions
- CRM
- Advanced analytics
- Team accounts
- Native mobile apps
- AI image generation
- Complex content calendar
- Multi-business accounts

## 4. Technology decisions

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Supabase Storage (foundation only in MVP)
- OpenAI Responses API
- PWA manifest + service worker
- Vercel deployment target

## 5. Routes

### Public
- `/`
- `/login`
- `/register`
- `/forgot-password`

### Onboarding
- `/business/setup`

### Authenticated
- `/dashboard`
- `/create`
- `/create/result`
- `/projects`
- `/projects/[id]`
- `/business`
- `/settings`

### Server API
- `/api/generate`

## 6. UI shell

Desktop:
- 232px left sidebar
- top header inside main content
- main content max width ~1440px
- page background `#F8FAFC`
- cards on white surfaces

Mobile:
- compact header
- bottom navigation: Home / Create / Projects / Business
- Settings under user/profile menu

## 7. Design tokens

### Colors
- Primary: `#7C3AED`
- Primary Dark: `#5B21B6`
- Accent: `#E879F9`
- Accent Light: `#F3E8FF`
- Background: `#F8FAFC`
- Card: `#FFFFFF`
- Text: `#0F172A`
- Secondary text: `#475569`
- Border: `#E2E8F0`
- Success: `#10B981`
- Warning: `#F59E0B`
- Error: `#EF4444`
- Info: `#3B82F6`

### Typography
- Font: Poppins
- H1: 32px / 40px
- H2: 24px / 32px
- H3: 20px / 28px
- Body: 16px / 24px
- Small: 14px / 20px
- Caption: 12px / 16px

### Component rules
- Card radius: 16px
- Input radius: 10–12px
- Primary button radius: 10–12px
- Avoid excessive shadows
- Prefer one primary CTA per view
- Reuse shared UI primitives instead of creating ad-hoc variants

## 8. Database schema

### `profiles`
- `id uuid primary key references auth.users(id) on delete cascade`
- `name text`
- `created_at timestamptz`
- `updated_at timestamptz`

### `businesses`
- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `name text not null`
- `industry text not null default 'beauty_salon'`
- `city text`
- `description text`
- `target_audience text`
- `tone_of_voice text`
- `brand_description text`
- `created_at timestamptz`
- `updated_at timestamptz`

### `services`
- `id uuid primary key`
- `business_id uuid references businesses(id) on delete cascade`
- `name text not null`
- `description text`
- `price numeric`
- `currency text default 'MDL'`
- `created_at timestamptz`
- `updated_at timestamptz`

### `projects`
- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `business_id uuid references businesses(id) on delete cascade`
- `type text check (type in ('post','story','reels','ad'))`
- `goal text`
- `title text`
- `prompt text`
- `content text`
- `status text check (status in ('draft','saved'))`
- `created_at timestamptz`
- `updated_at timestamptz`

### `generations`
- `id uuid primary key`
- `project_id uuid references projects(id) on delete cascade`
- `model text`
- `input_tokens integer`
- `output_tokens integer`
- `created_at timestamptz`

## 9. Security

- Never expose the OpenAI secret to the browser.
- OpenAI requests happen on the server.
- Supabase Auth manages user sessions.
- RLS must be enabled on every user-owned table.
- Every business/project/service query must be scoped to the authenticated user.
- Never trust `user_id` sent by the client; derive it from the authenticated session.
- Validate request bodies server-side.
- Return user-friendly errors; do not expose stack traces or internal provider details.

## 10. AI generation contract

Input:
- business profile
- services
- marketing goal
- content type
- topic
- optional details
- tone

Output should be structured JSON, not arbitrary prose.

Expected shape:

```json
{
  "title": "string",
  "content": "string",
  "cta": "string",
  "hashtags": ["string"],
  "notes": "string"
}
```

The server must validate this shape before returning it to the client.

## 11. AI prompt strategy

System instructions define BeautyContent AI as an AI marketing assistant specialized in beauty salons.

The business profile is injected as context.

The user request supplies goal/type/topic/details.

The model must:
- respect business facts supplied by the user
- never invent prices, services, locations, qualifications, guarantees, or offers
- produce content in the selected language
- keep tone aligned with the business profile
- optimize for the selected marketing goal
- return valid JSON matching the schema

## 12. UX states

Every data-driven page must define:
- loading
- success
- empty
- error
- retry

AI generation additionally needs:
- generation in progress
- timeout
- provider error
- rate limit
- invalid model output

## 13. Dashboard behavior

Primary actions:
- Create Post
- Create Story
- Create Reels
- Create Ad

Business-goal shortcuts:
- Attract new customers
- Fill empty appointment slots
- Sell a service
- Bring back existing customers

Recent projects displayed below.

## 14. Create behavior

Required fields:
- content type
- marketing goal
- topic

Optional:
- details
- tone override

On submit:
1. validate form
2. load authenticated business context
3. send generation request to `/api/generate`
4. show AI loading state
5. validate structured response
6. display result
7. allow edit/save/copy/regenerate

## 15. Project behavior

Saving a result creates a row in `projects`.

Project detail supports:
- edit
- save changes
- copy
- regenerate
- download text
- delete

## 16. PWA

- `app/manifest.ts`
- `public/sw.js`
- standalone display mode
- app icons
- theme color
- HTTPS required in production
- offline AI is explicitly out of scope
- push notifications are reserved for later versions

## 17. Environment variables

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
AI_PROVIDER=openai
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Only the first two are client-exposed by design. `AI_PROVIDER`, `OPENAI_API_KEY`, and `GEMINI_API_KEY` must remain server-only.

## 18. Folder structure

```text
app/
  (marketing)/
  (auth)/
  (app)/
  api/
    generate/
components/
  ui/
  navigation/
  dashboard/
  content-generator/
  content-result/
  projects/
  business/
lib/
  supabase/
  openai/
  prompts/
  validation/
types/
supabase/
  migrations/
public/
  icons/
  sw.js
```

## 19. Coding rules for Copilot

1. TypeScript strict mode.
2. Prefer small reusable components.
3. No `any` unless absolutely unavoidable and documented.
4. No secrets in client components.
5. Server/client boundaries must be explicit.
6. Validate inputs at the API boundary.
7. Use shared UI components from `components/ui`.
8. Do not introduce a new library when existing project functionality is sufficient.
9. After every significant phase run typecheck, lint and build.
10. Fix errors before moving to the next phase.
11. Do not silently invent missing requirements.
12. Keep changes focused to the requested task.

## 20. Definition of Done for MVP

A fresh user can:

`Register → Setup business → Dashboard → Create → Generate → Edit → Save → Projects → Reopen`

and another authenticated user cannot access that user's business, services, or projects.
