# Metabase Companion (React Native) — Design Spec

- **Date:** 2026-06-14
- **Status:** Approved — proceeding to implementation plan
- **Name:** Metabase Companion
- **Repo:** `metabase-rn` (this directory)
- **Min supported Metabase:** v0.48+ (older may work, not guaranteed)

---

## 1. Summary & Goals

An **open-source, general-purpose, read-only mobile client** for **any** Metabase
instance (Cloud or self-hosted; OSS, Pro, or Enterprise). It talks directly to the
Metabase REST API and **renders all visualizations natively** in React Native — no
WebView, no required backend of our own. The app is fully standalone: a user enters
their instance URL, logs in, and browses/views their dashboards and questions.

This is **Approach B** (chosen by the user): native API client + native re-rendering of
the **full set** of Metabase chart types, rather than the lighter "render common charts,
fall back to a table" variant.

### Goals

- Work against an unmodified Metabase instance of any edition, with zero server-side setup.
- Fast, native, phone-first viewing of dashboards, KPIs, and saved questions.
- Faithful native rendering of all Metabase `display` types (delivered in priority tiers).
- Secure, low-friction auth: password **and** Google sign-in (when the instance enables it),
  token in secure storage, biometric unlock.
- Be a well-engineered, contributor-friendly OSS project: TypeScript strict, tests, CI,
  lint/format, i18n, theming, clear docs, Apache-2.0 license.

### Non-goals (out of scope, at least for v1)

- Creating or editing questions; the query builder; the SQL/native editor.
- Creating, editing, or rearranging dashboards.
- Any admin surface (data sources, permissions, users, settings).
- Metabase Actions / write-backs / data modeling.
- Push notifications, JWT-signed static embeds, sandboxed full-app embedding
  (all require a backend and/or Pro — tracked as fast-follow, see §15).

---

## 2. Users & Use Cases

- **Primary persona:** an analyst/operator/founder who wants to check their numbers from
  their phone. Personal-first, but the app must support multiple users (each logs in with
  their own credentials; data is scoped by their Metabase permissions).
- **Instances:** any URL the user controls or has access to — Metabase Cloud or self-hosted.
- **Core jobs:**
  1. Open a key dashboard and read its KPIs/charts at a glance.
  2. Browse and search collections, dashboards, and saved questions.
  3. View a single saved question's result, natively rendered.
  4. Adjust dashboard filters and re-run; basic tap-to-drill.

---

## 3. Architecture Overview

A layered, modular RN (Expo) app. Each layer has one job and a typed interface, so it can
be understood and tested in isolation.

```
┌──────────────────────────────────────────────────────────────┐
│  features/ (screens)   auth · browse · dashboard · question ·  │
│                        search · settings · instance-setup      │
├──────────────────────────────────────────────────────────────┤
│  render/   visualization registry: display-type → component    │
│            (Skia/SVG charts, tables, scalars, gauges, maps…)    │
├──────────────────────────────────────────────────────────────┤
│  ui/       design system: theme, tokens, primitives, i18n      │
├──────────────────────────────────────────────────────────────┤
│  store/    Zustand: active instance, accounts, theme, locale   │
│  (server state lives in TanStack Query cache, not here)        │
├──────────────────────────────────────────────────────────────┤
│  api/      typed Metabase REST client + zod parsers +          │
│            session/401 interceptor + capability detection      │
├──────────────────────────────────────────────────────────────┤
│  auth/     session lifecycle, secure storage, biometrics,      │
│            multi-instance/account management                   │
└──────────────────────────────────────────────────────────────┘
```

**Key principles**

- **Defensive parsing:** the Metabase API is explicitly unversioned and "subject to change"
  ([docs/api.json](https://github.com/metabase/metabase/blob/master/docs/api.json)). Every
  response is parsed through a zod schema that tolerates extra/missing fields and fails
  loudly only on truly required shape. Renderers never assume a field exists.
- **Capability detection:** read instance version + enabled features from
  `GET /api/session/properties` and adapt (e.g. show Google button only if configured).
- **No backend of our own:** everything is client ↔ Metabase. Any feature that would need a
  server (push, JWT embeds) is deferred.

---

## 4. Authentication & Session

### 4.1 Instance setup

- User enters an instance URL. We normalize it (add `https://`, strip trailing slash, allow
  custom ports/paths) and validate by calling `GET /api/session/properties` (works
  unauthenticated). From the response we read: `site-name`, `version`, enabled auth methods,
  and `google-auth-client-id`.
- Saved instances are persisted (URL + display name + site version snapshot). The app
  supports **multiple instances and accounts**, switchable from Settings.

### 4.2 Login methods (detected per instance)

- **Username / password (always available):**
  `POST /api/session` with `{ "username": "<email>", "password": "<pw>" }` →
  `{ "id": "<uuid>" }`. That `id` is the session token.
- **Google sign-in (shown only if `google-auth-client-id` is present):**
  1. Read the instance's Google client id from `/api/session/properties`.
  2. Use the native Google Sign-In SDK (`@react-native-google-signin/google-signin`),
     configured so the returned **idToken's audience matches that client id**, to obtain an
     idToken.
  3. `POST /api/session/google_auth` with `{ "token": "<google-id-token>" }` →
     a normal Metabase session (same shape as `/api/session`).
  - **Caveat:** Metabase verifies the idToken audience against its configured client id.
    Whether a native-SDK token is accepted must be validated against a live instance. If it
    fails, the UI falls back to password login and surfaces a clear message. Documented as a
    known limitation.
- **SAML / JWT SSO:** out of scope (Pro/Enterprise only, browser-redirect based).

### 4.3 Token use, storage, lifecycle

- Every authenticated request sends header `X-Metabase-Session: <uuid>`. We read the token
  from the JSON body, not from `Set-Cookie`.
- Token is stored in **`expo-secure-store`** (iOS Keychain / Android Keystore), **never**
  AsyncStorage. App access is gated by **biometric unlock** (`expo-local-authentication`)
  with a device-passcode fallback.
- **Validation on launch:** `GET /api/user/current` with the stored token; on success, go
  straight to the app; on 401, route to login.
- **401 interceptor (single retry):** on any 401, attempt exactly one silent re-auth, then
  retry the original request once.
  - Google accounts: re-run silent Google sign-in to get a fresh session.
  - Password accounts: if the user opted into "remember me" (credentials kept in secure
    store behind biometrics), re-login silently; otherwise prompt for re-login.
  - On repeated failure, clear the session and route to login.
- **Logout:** `DELETE /api/session` then wipe the token (and any cached credentials) from
  secure store.
- Logins are rate-limited server-side, so we **cache and reuse** the token and never log in
  per request.

---

## 5. API Client (`api/`)

- A single typed `fetch` wrapper bound to the active instance's base URL, injecting the
  session header, normalizing errors into a small typed union
  (`NetworkError | AuthError(401) | ForbiddenError(403) | NotFound(404) | ServerError | ParseError`).
- Each endpoint has a typed function returning a zod-validated model.
- **Version awareness:** capture `version` from `/api/session/properties`; expose it so
  parsers/renderers can branch if a known breaking shape change appears.

Endpoints used (read-only):

| Purpose                              | Endpoint                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Instance/auth properties (pre-login) | `GET /api/session/properties`                                                                   |
| Password login / logout              | `POST /api/session` · `DELETE /api/session`                                                     |
| Google login                         | `POST /api/session/google_auth`                                                                 |
| Current user (validate session)      | `GET /api/user/current`                                                                         |
| Collections tree / items             | `GET /api/collection/tree` · `GET /api/collection/:id/items` · `GET /api/collection/root/items` |
| Dashboard                            | `GET /api/dashboard/:id`                                                                        |
| Run card in dashboard context        | `POST /api/dashboard/:dash/dashcard/:dashcard/card/:card/query`                                 |
| Card (metadata) / run card           | `GET /api/card/:id` · `POST /api/card/:id/query`                                                |
| Ad-hoc / drill query                 | `POST /api/dataset`                                                                             |
| Search                               | `GET /api/search`                                                                               |

---

## 6. Data Fetching & State

- **Server state → TanStack Query.** Query keys namespaced by instance id. Sensible
  `staleTime`, retry (excluding 401/403/404), refetch-on-focus, and **pull-to-refresh** on
  list/detail screens. `ignore_cache` exposed where a hard refresh is wanted.
- **Client state → Zustand** (small): active instance, saved accounts, theme, locale,
  auth status. Persisted via secure store (tokens) + a non-sensitive store (preferences).
- **Offline (MVP-light, expand later):** persist the Query cache so recently viewed
  dashboards open instantly with a "last updated / stale" banner. No offline filtering or
  drill. Full offline is a fast-follow.

---

## 7. Visualization Rendering (Approach B — core of the app)

### 7.1 Card data model

Two calls per card (they return different things):

- `GET /api/card/:id` → `display` (chart type) and `visualization_settings` (series colors,
  `graph.dimensions`/`graph.metrics`, axis titles, stacking, goal lines, per-column
  formatting, etc.).
- `POST /api/card/:id/query` (or the dashcard query endpoint inside a dashboard) → results:
  `data.rows` (positional **array-of-arrays**) and `data.cols` (column metadata with
  `base_type`/`semantic_type`).

### 7.2 Result normalization (shared by all renderers)

A pure module that:

- Zips `rows[i]` against `cols[j]` by index into labeled records.
- Coerces by `base_type` (`type/DateTime`→Date, `type/Integer|Float`→number, …).
- Formats by `semantic_type` + `visualization_settings.column_settings`
  (`type/Currency`, `type/Percentage`, dates, scaling, prefixes/suffixes).
- This module is heavily unit-tested with fixtures; renderers consume its typed output only.

### 7.3 Renderer registry

A `display` → React component map. Adding a chart type = adding one registry entry. A type
without a renderer yet shows a clear **placeholder** ("This chart type isn't rendered yet")
during development — the architecture stays "pure native," and the end state is full
coverage.

### 7.4 Coverage tiers (delivery order, but all are in scope)

- **Tier 1 (ship first):** `scalar`/number, `smartscalar`/trend, `table`, `bar`, `row`
  (horizontal bar), `line`, `area`, `combo` (line+bar), `pie`, `progress`, `gauge`,
  `funnel`, `waterfall`, `scatter`, `object`/detail.
- **Tier 2 (after Tier 1):** `pivot` (custom grid), `map` (region/choropleth, pin/markers,
  grid heatmap), `sankey`.

### 7.5 Chart substrate

- **Victory Native XL** (Skia + Reanimated + Gesture Handler — all Expo-compatible) for the
  cartesian + pie families (bar/row/line/area/combo/scatter/pie). Strong performance and
  gesture support for large datasets and drill.
- **Bespoke `react-native-svg`** components for scalar/trend, gauge, progress, funnel,
  waterfall, and the pivot grid.
- **`react-native-maps`** (or a geo lib) for map types (Tier 2).
- _(This upgrades the earlier `react-native-gifted-charts` default to match Approach B's full
  coverage; confirm at spec review — see Open Questions.)_

### 7.6 Visualization settings fidelity

Honor the high-value settings first: series colors, axis titles, stacking, goal lines,
number/date/currency formatting, legend. Pixel-perfect parity with every Metabase web
option is explicitly **best-effort, prioritized**, not a launch gate.

### 7.7 Dashboards

- `GET /api/dashboard/:id` returns dashcards with a grid layout (`col`, `row`, `size_x`,
  `size_y`). On a phone we **reflow to a single column** in reading order, sized sensibly.
- **Filters:** dashboard `parameters` rendered as mobile controls; changing them re-queries
  the affected cards (via the dashcard query endpoint with `parameters`).
- **Drill (basic in MVP, deeper in Tier 2):** tapping a data point issues a `POST /api/dataset`
  drill query and pushes a detail view.

---

## 8. Navigation & Screens (Expo Router, file-based)

| Route              | Screen                                                               |
| ------------------ | -------------------------------------------------------------------- |
| `/setup`           | Instance URL entry + validation                                      |
| `/login`           | Password + (conditional) Google                                      |
| `/unlock`          | Biometric unlock (returning users)                                   |
| `/(tabs)/home`     | Home: recents/favorites + root collection                            |
| `/(tabs)/browse`   | Collection tree / items browser                                      |
| `/(tabs)/search`   | Search across content                                                |
| `/(tabs)/settings` | Instances/accounts, theme, language, biometric toggle, logout, about |
| `/dashboard/[id]`  | Dashboard view (reflowed cards + filters)                            |
| `/card/[id]`       | Saved question / card detail (native render)                         |

---

## 9. Theming & i18n

- **Theme:** light/dark, follows system by default, manual override. Centralized design
  tokens (color, spacing, typography); chart palettes derive from the theme but respect
  per-series colors from `visualization_settings`.
- **i18n:** `i18next` + `react-i18next`, **English + Chinese** at launch, device-locale
  default, easy to add languages. All user-facing strings externalized.

---

## 10. Error Handling & Edge Cases

- Clear states for: network failure, `401` (→ re-auth flow), `403` (no permission),
  `404` (deleted content), version-mismatch/parse errors (graceful "couldn't render"),
  empty results, very large tables (virtualized lists), slow/timeout queries (cancel +
  retry).
- **Self-hosted TLS:** many self-hosted instances use custom/self-signed certs. MVP requires
  valid TLS; an "allow self-signed (advanced/insecure)" toggle is a documented later option,
  not default.
- Never block the whole screen on one failed card — render per-card error tiles.

---

## 11. Security

- Session token (and optional remembered credentials) only in `expo-secure-store`, behind
  biometrics. Wiped on logout.
- No secrets shipped in the app bundle (we have none — no backend).
- Enforce HTTPS by default; redact tokens/credentials from any logs; no analytics that leak
  instance data.

---

## 12. Testing

- **Unit:** API zod parsers (against captured fixtures), result-normalization/formatting,
  auth/session logic (incl. 401 retry), renderer registry selection.
- **Component:** React Native Testing Library for screens and renderers; **MSW** to mock the
  Metabase API.
- **Renderer fixtures:** for each `display` type, a captured query-result fixture drives a
  render test (and snapshot where stable).
- **Targets:** meaningful coverage on `api/`, `auth/`, and `render/` normalization
  (the logic-heavy, regression-prone layers). CI runs typecheck + lint + tests on every PR.

---

## 13. CI/CD & Build

- **GitHub Actions:** `typecheck` (tsc), `lint` (ESLint/Prettier), `test` (Jest) on PRs and
  main.
- **Builds:** Expo + **EAS Build** with `dev`, `preview`, `production` profiles. Document how
  to produce an installable build for a personal device (dev build / internal distribution) —
  no App Store needed for personal use; store submission is optional later.
- **Releases:** semver tags + CHANGELOG; EAS Update for OTA JS updates later (optional).

---

## 14. Repo Structure & OSS Hygiene

```
metabase-rn/
├─ app/                      # Expo Router routes (screens)
├─ src/
│  ├─ api/                   # typed Metabase client + zod schemas
│  ├─ auth/                  # session, secure storage, biometrics, instances
│  ├─ render/                # visualization registry + renderers + normalization
│  ├─ ui/                    # design system, theme, i18n
│  ├─ store/                 # zustand stores
│  └─ lib/                   # shared utils
├─ __tests__/ + fixtures/    # tests and captured API fixtures
├─ docs/                     # this spec, architecture notes, contributor docs
├─ .github/                  # workflows, issue/PR templates
├─ app.json / eas.json       # Expo / EAS config
├─ README.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  LICENSE (Apache-2.0)  NOTICE  CHANGELOG.md
└─ tsconfig.json  .eslintrc  .prettierrc
```

---

## 15. Delivery Milestones

- **M0 — Foundation:** Expo + TS + Expo Router scaffold, CI, lint/format, theme/i18n skeleton,
  instance setup, password + Google login, secure storage + biometrics, API client + 401
  interceptor, `user/current` gate.
- **M1 — View core:** browse collections, dashboard view (single-column reflow), card detail;
  Tier-1 renderers subset (table, scalar/trend, bar, line, area, pie). Pull-to-refresh.
- **M2 — Breadth:** remaining Tier-1 renderers (row, combo, scatter, gauge, progress, funnel,
  waterfall, object), search, dashboard filters, basic drill, theming/i18n polish.
- **M3 — Long tail:** Tier-2 renderers (pivot, maps, sankey), deeper drill, offline cache.
- **Fast-follow (post-v1):** push via a webhook relay (needs backend + admin config),
  CSV/XLSX export, view existing alerts/subscriptions, deep links / share-to-app.

---

## 16. Risks & Mitigations

1. **Unversioned, drifting API.** → zod defensive parsing, capture fixtures per supported
   version, branch on `version` where needed.
2. **Full native viz parity is unbounded.** → tiered delivery, settings fidelity is
   prioritized/best-effort, placeholder for not-yet-built types; never block launch on parity.
3. **Google idToken audience may be rejected by `google_auth`.** → validate against a live
   instance early; password fallback; document per-instance Google setup.
4. **Short `MAX_SESSION_AGE` / Pro inactivity timeout.** → single silent 401 re-auth +
   biometric re-unlock; clear re-login prompts otherwise.
5. **Self-signed TLS on self-hosted.** → require valid TLS in MVP; documented advanced
   opt-in for self-signed later.

---

## 17. Resolved Decisions (was Open Questions)

1. **App name:** **Metabase Companion** (confirmed). Note in README that it's an unofficial,
   community client not affiliated with Metabase, Inc.
2. **Minimum Metabase version:** **v0.48+** (confirmed); older may work but isn't guaranteed.
3. **Chart library:** **Victory Native XL + react-native-svg** (confirmed; §7.5).
