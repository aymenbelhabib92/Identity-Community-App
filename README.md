# Identity Community App

The app of the **Identity** car community: membership and dues, member pass with QR check-in,
member map, secret meetups, announcements. It ships today as a **web app / installable PWA**
(Android and iPhone), backed by an API designed to serve the future **React Native** app with the
same routes.

## Features

| Area | What members get | What staff get |
| --- | --- | --- |
| **Membership** | Join request, entry fee (20 DT) and dues (5 DT / 3 months) by proof upload or in person, payment history, validity date | Review queue with the proof, verify / reject with a note, record cash payments, approve founding members, suspend, temporary passwords |
| **Pass** | Card with badge number, role, validity; QR code refreshed every few minutes, one tap away on the home banner | In-app scanner (or phone camera) → "Valid member" / "Not valid", with the member's photo |
| **Profile** | Profile photo, car and up to 4 car photos, green dot when online, ring in the colour of the membership | Photos on member lists, payments and pass checks |
| **Map** | Opt-in location sharing, snapped to a ~100 m grid, visible to active members only, member photos, clusters, member & place search | — |
| **Meetups** | Public, **secret** (meeting point revealed to confirmed members N hours before) and organizers-only meetups, RSVP, directions | Create / edit / cancel, map picker with place search, attendee list |
| **Club** | Announcements, club rules, notifications in the app and as **push notifications** on the phone | Post announcements (everyone / staff), edit fees, dues period, grace period, rules, payment instructions |
| **Chat** | One club chat for active members: live messages, history, replies, @mentions, unread badge; chat notifications off / mentions and replies (default) / all messages grouped | Admins delete any message (members delete their own) |
| **Preferences** | English or French (the phone's language by default, remembered on the account), dark / light / automatic theme | — |

Roles: **member**, **organizer** (meetups, announcements, pass checks), **treasurer** (payments),
**admin** (everything, roles, settings).

Navigation: four tabs (Home, Map, Meetups, Chat). The avatar at the top right of Home opens the
**account** screen: pass and membership, profile, car, language, theme, password, admin tools.

## Architecture

```
apps/
  api/        Fastify + Drizzle ORM (PostgreSQL). REST API /api/v1, OpenAPI docs at /api/docs
  web/        React + Vite PWA (React Router, TanStack Query, Leaflet)
packages/
  shared/     API contract (zod schemas), domain rules (dues periods, membership state,
              permissions, location privacy), typed API client — reused by the native app
brand/        Logo source (SVG) — `npm run brand` regenerates icons and textures
docker/       Caddyfile (web server + HTTPS + /api proxy)
```

- **One API for every client.** Request and response schemas live in `packages/shared`; the API
  validates and documents with them, the web app (and later the native app) types itself from them
  and calls the API through the same `createApiClient`.
- **Database:** PostgreSQL in production. In development the API uses **PGlite** (the real Postgres
  engine, embedded) — no database to install. Migrations (`apps/api/drizzle`) apply on start.
- **Money** is stored in millimes (1 DT = 1000) — `7.500 DT` stays exact.
- **Time zone:** dues periods and "today" are computed in `Africa/Tunis`.
- **Languages:** English texts are the keys (`t('Sign in')`), French lives in two dictionaries:
  `packages/shared/src/locales/fr.ts` (labels, API messages, notifications) and
  `apps/web/src/locales/fr.ts` (screens). A missing key falls back to English. The API answers in
  the language of the request (`Accept-Language`) and writes each notification in its recipient's
  language.
- **Themes:** every colour is a CSS variable in `apps/web/src/styles/global.css`; the light palette
  overrides them under `data-theme="light"`.
- **Push notifications** (Web Push): every in-app notification is also pushed to the devices where
  the member turned them on — from the banner shown at each opening, or Account › Notifications.
  The PWA's service worker shows them (`apps/web/public/push-sw.js`) and opens their page when
  tapped. The VAPID key pair is generated on first start and kept in the database (or set
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`); `PUBLIC_URL` identifies the club to the push services.
  On iPhone (iOS 16.4+), notifications work once the app is installed on the Home Screen. They
  need HTTPS, so they are not available with `npm run dev` (no service worker): use
  `npm run build -w @identity/web && npm run preview -w @identity/web`.
- **Chat:** messages are kept in the database (`chat_messages`; a deleted message keeps its place
  without its text). While the Chat screen is open and the app in the foreground, it receives new
  and deleted messages live through Server-Sent Events (`GET /api/v1/chat/stream`, excluded from
  compression in the Caddyfile) and reloads what it missed after a lost connection. A member
  reading the chat gets no push for it; otherwise mentions and replies are pushed one by one, and
  members who chose "all messages" get one grouped notification at most every 3 minutes
  (`CHAT_PUSH_INTERVAL_MINUTES`). Chat messages never go to the bell.

## Getting started (development)

Requirements: Node.js 22.12+ (24 recommended). No Docker, no database.

```bash
npm install
npm run db:seed        # optional: demo data matching the mockups
npm run dev            # API on :3000 + web on :5173
```

- App: <http://localhost:5173>
- API docs (OpenAPI / Swagger UI): <http://localhost:3000/api/docs>

Demo accounts (password `demo1234` for all):

| Who | Phone |
| --- | --- |
| Karim — member #0042 | 20 000 042 |
| Sami — organizer | 20 000 007 |
| Leila — treasurer | 20 000 003 |
| Mehdi — admin | 20 000 001 |
| Walid — pending request (entry fee to review) | 20 000 099 |

`npm run db:seed -- --reset` wipes the local database and reloads the demo.

**On a phone (same Wi-Fi):** geolocation, camera and PWA install need HTTPS, so run
`npm run dev:lan -w @identity/web` (self-signed certificate, accept the warning) with the API
running, then open `https://<your-computer-ip>:5173`.

### Scripts

| Command | |
| --- | --- |
| `npm run dev` | API (watch) + web (HMR) |
| `npm test` | Domain unit tests + API integration tests (real Postgres engine in memory) |
| `npm run typecheck` | TypeScript on every package |
| `npm run build` | Production builds (API bundle, web PWA) |
| `npm run db:generate` | New SQL migration after editing `apps/api/src/db/schema.ts` |
| `npm run db:seed` | Demo data |
| `npm run brand` | Regenerate icons / textures from `brand/identity-logo.svg` |

Run the API tests against a real PostgreSQL server with
`TEST_DATABASE_URL=postgres://… npx vitest run --no-file-parallelism` (in `apps/api`; the database is wiped).

## Membership rules

- **Join:** the member creates an account (status *pending*), then pays the **entry fee** by
  uploading a proof or in person. When the treasurer verifies it, the membership becomes **active**
  and a **badge number** is assigned. Admins can also approve without payment (founding members).
- **Dues** are paid per calendar-aligned period (with 3 months: Q1 Jan–Mar, Q2 Apr–Jun…), up to a
  year at once. The entry fee covers the period in which the member is activated (setting).
- **States:** *active* while dues cover today → *dues due* during the grace period (15 days, still
  full access) → *expired*. Missed periods are not charged retroactively: a returning member pays
  from the current period.
- Fees, currency, period length (1/2/3/4/6/12 months), grace period and rules are edited in
  **Admin › Club settings**. New amounts apply to payments submitted afterwards.

## Privacy and security

- **Location:** positions are snapped server-side to a ~100 m grid before being stored — the exact
  point is never kept (`LOCATION_PRECISION_METERS` in `packages/shared/src/geo.ts`). Sharing is
  opt-in, turning it off deletes the position, stale positions disappear (24 h by default), and
  only active members can see the map.
- **Photos:** the app resizes pictures before upload, which also drops their metadata (such as
  where they were taken). They are served to signed-in accounts only: profile photos to every
  account, car photos to active members. The server checks files by content (JPG, PNG, WEBP, 5 MB
  max).
- **Presence:** "online" means the app talked to the server in the last 5 minutes. Other members
  see that green dot; the membership state of a member is shown to staff only.
- **Chat:** readable and writable by members with access only (active, or dues due during the
  grace period); sending is limited to 30 messages a minute per member.
- **Secret meetups:** the API never sends the meeting point before the reveal time, and only to
  members who confirmed (plus staff). Members without an active membership do not see secret
  meetups at all.
- **Payment proofs** are private files, readable only by their owner and the treasurer/admins;
  uploads are checked by content (JPG, PNG, WEBP, HEIC, PDF, 8 MB max).
- **Pass QR codes** hold a signed token valid 10 minutes (in the URL fragment, never logged);
  verification needs an organizer account.
- Passwords are hashed with scrypt; sessions are JWTs revocable per user (password change,
  "sign out on all devices", admin reset). Sign-in is rate-limited.

## Deployment (Docker)

The stack is ready for Docker Compose: PostgreSQL + API + web server (Caddy, automatic HTTPS).

```bash
cp .env.example .env    # domain, POSTGRES_PASSWORD, JWT_SECRET, first admin phone/password
docker compose up -d --build
```

- Point the domain's DNS to the server first: Caddy then obtains the HTTPS certificate by itself.
- The first admin (`ADMIN_PHONE` / `ADMIN_PASSWORD`) is created on first start.
- Demo data (optional): `docker compose exec api node dist/db/seed.js --force`.
- Back up the `pgdata` (database) and `uploads` (payment proofs, member photos) volumes, e.g.
  `docker compose exec db pg_dump -U identity identity > backup.sql`.
- Update: `git pull && docker compose up -d --build` (database migrations apply on start).

## Maps

The map uses Leaflet with **Stadia Maps "Alidade Smooth"** (OpenStreetMap data), dark or light to
match the theme: free and keyless on localhost; in production, create a free Stadia account and
register the domain (or set `VITE_MAP_TILE_URL` to another provider, then used for both themes).
Place search goes through the API to OpenStreetMap
Nominatim. Moving to **Google Maps** later only touches `apps/web/src/components/map/` and
`apps/api/src/routes/geo.ts`.

## Brand

`brand/identity-logo.svg` was vectorised from the mockups. To use the official logo, replace that
file (single colour, `fill="currentColor"`) and run `npm run brand` to regenerate the in-app logo,
PWA icons, favicon and card texture.

## Native app (next)

The plan is an **Expo (React Native)** app in `apps/mobile`, reusing `packages/shared` (types,
rules, API client) and the same API. Android builds can be installed as an APK; iPhone apps go
through TestFlight / the App Store (Apple developer account). Until then, iPhone users install the
PWA from Safari (Share › Add to Home Screen).

## Roadmap

- Push notifications (web push now, native push with the app)
- Online payments (the payment model already separates amount, method and review)
- Members-only store with configurable product categories
- Cruising events: shared routes and starting points
- Parts marketplace between members
- Club blog (rules, news) and live chat (global and per event)
