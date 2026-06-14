# Metabase Companion — M0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each numbered task below is an independently executable unit — work them in order, and check it off in the Task Index when its steps pass.

**Goal:** Stand up the foundation of Metabase Companion — an open-source, read-only React Native (Expo) client for any Metabase instance — so a user can add an instance, log in (password or Google), have their session stored securely and unlocked with biometrics, and land on a placeholder home that confirms who they are signed in as.

**Architecture:** Approach B (native REST client; native chart rendering arrives in later milestones). Strictly layered, each layer depending only on those below it: `src/lib` (pure utils) → `src/api` (typed client + Zod) → `src/auth` (session / secure storage / biometrics / Google) and `src/store` (Zustand) → `src/ui` + `app/` (Expo Router screens). No backend of our own — the app talks directly to the Metabase REST API; credentials and session tokens never leave the device.

**Tech Stack:** Expo (managed, SDK 52+) · TypeScript (strict) · Expo Router · TanStack Query · Zustand · Zod · i18next (en/zh) · expo-secure-store · expo-local-authentication · @react-native-google-signin/google-signin · Victory Native + Skia (charts, later milestones) · Jest (jest-expo) + React Native Testing Library + MSW.

---

## Shared Interface Contract

Every task conforms to these names, paths, and signatures. (Full design: `docs/superpowers/specs/2026-06-14-metabase-rn-mobile-app-design.md`.)

### Endpoints used in M0
- `GET /api/session/properties` — unauthenticated; capability detection (site name, version, Google client id, password-login enabled).
- `POST /api/session` — `{ username, password }` → `{ id }` (the session token).
- `POST /api/session/google_auth` — `{ token }` (Google idToken) → `{ id }`.
- `DELETE /api/session` — logout.
- `GET /api/user/current` — validate the session, fetch the signed-in user.

Authenticated requests send header `X-Metabase-Session: <token>`. On HTTP 401 the client calls `onUnauthorized()` once; if it returns a new token, the request is retried once with it, otherwise an `unauthorized` error is thrown.

### Shared types (verbatim)
```ts
// src/api/errors.ts
export type ApiError =
  | { kind: 'network'; message: string }
  | { kind: 'unauthorized' }       // HTTP 401
  | { kind: 'forbidden' }          // HTTP 403
  | { kind: 'notFound' }           // HTTP 404
  | { kind: 'server'; status: number; message: string }
  | { kind: 'parse'; message: string };
export class ApiException extends Error { constructor(public readonly error: ApiError) { super(error.kind); } }

// src/api/client.ts
export interface MetabaseClientOptions {
  baseUrl: string;                                 // already normalized
  getToken: () => string | null;
  onUnauthorized?: () => Promise<string | null>;   // re-auth hook; returns NEW token or null
}
export class MetabaseClient {
  constructor(opts: MetabaseClientOptions);
  get<T>(path: string, schema: import('zod').ZodType<T>): Promise<T>;
  post<T>(path: string, body: unknown, schema: import('zod').ZodType<T>): Promise<T>;
  del(path: string): Promise<void>;
}

// src/api/schemas.ts  (Zod schemas mapping raw kebab/snake keys -> camelCase)
export interface SessionProperties { siteName: string; version: string; googleAuthClientId: string | null; passwordLoginEnabled: boolean; }
export interface CurrentUser { id: number; email: string; firstName: string | null; lastName: string | null; isSuperuser: boolean; }
export interface SessionToken { id: string; }

// src/auth/types.ts
export interface Instance { id: string; baseUrl: string; siteName: string; version: string; }
export interface Account { instanceId: string; userId: number; email: string; method: 'password' | 'google'; }

// src/lib/url.ts
export function normalizeBaseUrl(input: string): string; // adds https:// if no scheme; trims trailing slash; throws Error('Invalid URL')

// src/auth/secureStore.ts
export function saveToken(instanceId: string, token: string): Promise<void>;
export function getToken(instanceId: string): Promise<string | null>;
export function deleteToken(instanceId: string): Promise<void>;
export function saveCredentials(instanceId: string, username: string, password: string): Promise<void>;
export function getCredentials(instanceId: string): Promise<{ username: string; password: string } | null>;
export function deleteCredentials(instanceId: string): Promise<void>;

// src/auth/session.ts
export function fetchSessionProperties(baseUrl: string): Promise<SessionProperties>;
export function loginWithPassword(baseUrl: string, username: string, password: string): Promise<string>;
export function fetchCurrentUser(client: MetabaseClient): Promise<CurrentUser>;
export function logout(client: MetabaseClient): Promise<void>;

// src/auth/googleAuth.ts
export function loginWithGoogle(baseUrl: string, googleAuthClientId: string): Promise<string>;

// src/auth/biometrics.ts
export function isBiometricAvailable(): Promise<boolean>;
export function authenticate(promptMessage: string): Promise<boolean>;

// src/store/instances.ts  (zustand; persisted; tokens live ONLY in secureStore)
export interface InstancesState {
  instances: Instance[];
  activeInstanceId: string | null;
  addInstance: (instance: Instance) => void;
  setActiveInstance: (id: string | null) => void;
  removeInstance: (id: string) => void;
}

// src/store/preferences.ts  (zustand; persisted)
export interface PreferencesState {
  themeMode: 'system' | 'light' | 'dark';
  locale: 'system' | 'en' | 'zh';
  rememberCredentials: boolean;
  setThemeMode: (m: PreferencesState['themeMode']) => void;
  setLocale: (l: PreferencesState['locale']) => void;
  setRememberCredentials: (v: boolean) => void;
}

// src/ui/theme.ts
export interface Theme {
  mode: 'light' | 'dark';
  colors: { background: string; surface: string; text: string; textMuted: string; primary: string; border: string; danger: string };
  spacing: (n: number) => number;   // n * 4
  radius: { sm: number; md: number; lg: number };
}
export const lightTheme: Theme;
export const darkTheme: Theme;
```

---

## File Structure (created in M0)

```
metabase-rn/
├─ app/                          Expo Router routes
│  ├─ _layout.tsx                Root layout: AppProviders + auth gating
│  ├─ setup.tsx                  Instance URL entry + validation
│  ├─ login.tsx                  Password + conditional Google sign-in
│  ├─ unlock.tsx                 Biometric unlock
│  └─ (tabs)/
│     ├─ _layout.tsx             Tab navigator
│     ├─ index.tsx               Home placeholder ("Signed in as …")
│     └─ settings.tsx            Theme/language pickers + logout
├─ src/
│  ├─ lib/url.ts                 normalizeBaseUrl()
│  ├─ api/
│  │  ├─ errors.ts               ApiError union + ApiException
│  │  ├─ client.ts               MetabaseClient (fetch + Zod + 401 retry)
│  │  ├─ schemas.ts              Zod schemas (session properties, user, token)
│  │  └─ endpoints.ts            Typed endpoint helpers
│  ├─ auth/
│  │  ├─ types.ts                Instance, Account
│  │  ├─ secureStore.ts          Token/credential storage (expo-secure-store)
│  │  ├─ session.ts              login / logout / current user / properties
│  │  ├─ googleAuth.ts           Native Google → google_auth exchange
│  │  ├─ biometrics.ts           expo-local-authentication wrapper
│  │  └─ useAuthGate.ts          Pure routing-decision hook
│  ├─ store/
│  │  ├─ instances.ts            Zustand: instances + active (persisted)
│  │  └─ preferences.ts          Zustand: theme/locale/rememberCreds (persisted)
│  └─ ui/
│     ├─ theme.ts                Light/dark Theme tokens
│     ├─ ThemeProvider.tsx       Resolves theme; useTheme()
│     ├─ i18n.ts                 i18next init (en/zh)
│     └─ AppProviders.tsx        QueryClient + Theme + i18n + GestureHandler
├─ .github/workflows/ci.yml      typecheck + lint + test
├─ jest.setup.ts                 Jest mocks (secure-store, biometrics, google, reanimated, skia)
├─ app.json / babel.config.js / tsconfig.json / eslint config
└─ README.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  LICENSE  CHANGELOG.md
```

---

## Task Index

- [ ] **Task 1:** Scaffold the Expo app (TypeScript + Expo Router) into the existing non-empty directory
- [ ] **Task 2:** Install all runtime and dev dependencies
- [ ] **Task 3:** Configure `tsconfig.json` (strict + `@/*` path alias)
- [ ] **Task 4:** ESLint + Prettier config and npm scripts
- [ ] **Task 5:** Jest setup (jest-expo) + RNTL + module mocks + smoke test
- [ ] **Task 6:** GitHub Actions CI workflow
- [ ] **Task 7:** OSS hygiene files (README, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE, CHANGELOG)
- [ ] **Task 8:** App config (`app.json`) — name, slug, scheme, and config plugins
- [ ] **Task 9:** `normalizeBaseUrl` in `src/lib/url.ts`
- [ ] **Task 10:** API error types in `src/api/errors.ts`
- [ ] **Task 11:** Zod schemas in `src/api/schemas.ts`
- [ ] **Task 12:** `MetabaseClient` in `src/api/client.ts`
- [ ] **Task 13:** Endpoint helpers in `src/api/endpoints.ts`
- [ ] **Task 14:** Secure storage wrapper (`src/auth/secureStore.ts`)
- [ ] **Task 15:** Instances store (`src/store/instances.ts`)
- [ ] **Task 16:** Preferences store (`src/store/preferences.ts`)
- [ ] **Task 17:** Session lifecycle (`src/auth/session.ts`)
- [ ] **Task 18:** Google sign-in (`src/auth/googleAuth.ts`)
- [ ] **Task 19:** Biometrics (`src/auth/biometrics.ts`)
- [ ] **Task 20:** Design tokens — `src/ui/theme.ts`
- [ ] **Task 21:** Theme context — `src/ui/ThemeProvider.tsx`
- [ ] **Task 22:** i18n setup — `src/ui/i18n.ts`
- [ ] **Task 23:** App providers — `src/ui/AppProviders.tsx`
- [ ] **Task 24:** Auth-gate hook + root layout — `src/auth/useAuthGate.ts` and `app/_layout.tsx`
- [ ] **Task 25:** Setup screen — `app/setup.tsx`
- [ ] **Task 26:** Login screen — `app/login.tsx`
- [ ] **Task 27:** Unlock screen — `app/unlock.tsx`
- [ ] **Task 28:** Tabs layout, home, and settings — `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`
- [ ] **Task 29:** Lint + typecheck the UI/screens group

---

### Task 1: Scaffold the Expo app (TypeScript + Expo Router) into the existing non-empty directory

**Files:**
- Create: entire Expo skeleton (`app/`, `package.json`, `tsconfig.json`, `app.json`, `babel.config.js`, etc.)
- Modify: none yet (existing `docs/`, `.gitignore`, `.git/` must be preserved)
- Test: none (pure scaffold)

The current directory `/Users/eric/work/metabase-rn` already contains `docs/`, `.gitignore`, and a `.git` repo, so `create-expo-app .` will refuse to run (it requires an empty target, and we do NOT want it re-initializing git or clobbering our files). The clean approach: scaffold into a temp dir with the default template (Expo Router + TypeScript), then move the generated files in, preserving our `docs/`, `.gitignore`, and `.git`.

1. From the repo root, scaffold the default template (Expo Router + TypeScript) into a sibling temp directory. The default template (no `--template` flag) is already Expo Router + TypeScript in current SDKs:
   ```bash
   cd /Users/eric/work
   npx create-expo-app@latest metabase-rn-scaffold
   ```
   When it finishes you'll see `✅ Your project is ready!` and an `app/` directory inside `metabase-rn-scaffold`.

2. Remove the scaffold's own git repo and its lockfile-irrelevant junk so we don't import a second `.git` or its README/`.gitignore` over ours:
   ```bash
   rm -rf /Users/eric/work/metabase-rn-scaffold/.git
   rm -f  /Users/eric/work/metabase-rn-scaffold/.gitignore
   rm -f  /Users/eric/work/metabase-rn-scaffold/README.md
   ```
   (We keep our own `.gitignore` from Task 1 step 5 and write our own README in Task 7.)

3. Move everything (including dotfiles) from the scaffold into our repo root, without overwriting our existing `docs/`:
   ```bash
   shopt -s dotglob
   mv /Users/eric/work/metabase-rn-scaffold/* /Users/eric/work/metabase-rn/
   shopt -u dotglob
   rmdir /Users/eric/work/metabase-rn-scaffold
   ```
   If `mv` reports a conflict on `app/` (the default template ships an `app/` with example routes), that's fine — our repo had no `app/` yet, so it moves cleanly. The default template's example screens in `app/` will be replaced by other engineers' tasks; leave them for now so the app runs.

4. Append Expo's standard `.gitignore` entries to OUR existing `.gitignore` (don't replace it — preserve whatever is already there). Open `/Users/eric/work/metabase-rn/.gitignore` and ensure it contains at least:
   ```gitignore
   # Expo / React Native
   node_modules/
   .expo/
   dist/
   web-build/
   expo-env.d.ts

   # Native
   /ios
   /android

   # Metro
   .metro-health-check*

   # Debug
   npm-debug.*
   yarn-debug.*
   yarn-error.*

   # macOS
   .DS_Store
   *.pem

   # Local env files
   .env*.local
   .env

   # TypeScript
   *.tsbuildinfo

   # Coverage
   /coverage
   ```

5. Verify the base install works and the dev server boots (this is the smoke test for scaffolding; you do NOT need a device — Ctrl-C after Metro prints its QR code):
   ```bash
   cd /Users/eric/work/metabase-rn
   npm install
   npx expo start --no-dev --clear
   ```
   Expected: Metro bundler starts and prints `› Metro waiting on exp://...` plus a QR code and `Logs for your project will appear below.` Press `Ctrl-C` to stop.

   Note: `@react-native-google-signin/google-signin` and `@shopify/react-native-skia` require a **development build** (`npx expo run:ios` / EAS dev build), NOT Expo Go. The Metro server above still starts fine in Expo Go for everything that doesn't touch those native modules; full auth/chart features need a dev build, added in a later milestone.

6. Commit the scaffold:
   ```bash
   cd /Users/eric/work/metabase-rn
   git add -A
   git commit -m "chore: scaffold Expo app (TypeScript + expo-router)"
   ```

---

### Task 2: Install all runtime and dev dependencies

**Files:**
- Modify: `/Users/eric/work/metabase-rn/package.json` (deps added by installers)
- Test: none (dependency install)

Use `npx expo install` for anything native or Expo-managed (it resolves SDK-compatible versions). Use `npm i -D` only for pure dev/JS tooling. Do NOT pin version numbers — let Expo/npm pick.

1. Core data + state + validation (pure JS, but install via `expo install` so Expo can warn about any RN-specific peer needs):
   ```bash
   cd /Users/eric/work/metabase-rn
   npx expo install @tanstack/react-query zustand zod
   ```

2. i18n stack:
   ```bash
   npx expo install i18next react-i18next expo-localization
   ```

3. Secure storage, biometrics, and Google sign-in (all require native modules / config plugins; `expo install` picks compatible versions):
   ```bash
   npx expo install expo-secure-store expo-local-authentication @react-native-google-signin/google-signin
   ```

4. Charting + animation + gesture + SVG stack (used in LATER milestones, installed now so the dependency tree is complete and config plugins/babel are wired early):
   ```bash
   npx expo install victory-native @shopify/react-native-skia react-native-reanimated react-native-gesture-handler react-native-svg
   ```

5. Dev tooling — testing (jest-expo, RNTL, MSW), lint/format, and TypeScript types. `jest-expo` and the type packages go through `expo install` per Expo's recommendation; the rest are plain dev deps:
   ```bash
   npx expo install -- --save-dev jest-expo
   npm i -D jest @types/jest @testing-library/react-native @testing-library/jest-native msw \
            eslint eslint-config-expo prettier eslint-config-prettier eslint-plugin-prettier \
            @types/react typescript
   ```
   Note: `react-test-renderer` is pulled in transitively by `jest-expo`/`@testing-library/react-native`; if `npm test` later complains it's missing, add it pinned to the React version with `npx expo install -- --save-dev react-test-renderer`.

6. Wire `react-native-reanimated`'s Babel plugin (required for Reanimated 3+; without it, anything importing Reanimated crashes). Open `/Users/eric/work/metabase-rn/babel.config.js` and ensure it reads exactly:
   ```js
   module.exports = function (api) {
     api.cache(true);
     return {
       presets: ['babel-preset-expo'],
       plugins: ['react-native-reanimated/plugin'],
     };
   };
   ```
   `react-native-reanimated/plugin` MUST be listed last in the `plugins` array.

7. Sanity-check the install (no command should error):
   ```bash
   cd /Users/eric/work/metabase-rn
   npx expo-doctor || true
   ```
   Expected: `expo-doctor` reports its checks; warnings about missing native config for google-signin are expected at this stage (resolved in Task 8). It must not hard-fail on dependency resolution.

8. Commit:
   ```bash
   git add -A
   git commit -m "chore: install runtime and dev dependencies"
   ```

---

### Task 3: Configure `tsconfig.json` (strict + `@/*` path alias)

**Files:**
- Modify: `/Users/eric/work/metabase-rn/tsconfig.json`
- Test: none (config)

1. Replace the contents of `/Users/eric/work/metabase-rn/tsconfig.json` with exactly:
   ```json
   {
     "extends": "expo/tsconfig.base",
     "compilerOptions": {
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "baseUrl": ".",
       "paths": {
         "@/*": ["src/*"],
         "@/app/*": ["app/*"]
       }
     },
     "include": [
       "**/*.ts",
       "**/*.tsx",
       ".expo/types/**/*.ts",
       "expo-env.d.ts"
     ],
     "exclude": ["node_modules"]
   }
   ```
   `expo/tsconfig.base` already enables JSX and the React Native libs; we layer `strict` + `noUncheckedIndexedAccess` on top. The `@/*` alias maps to `src/*` (the contract's primary alias); `@/app/*` is provided so app routes can import sibling route files when needed.

2. Create the `src/` tree the alias points at (empty dirs would be dropped by git, so add a `.gitkeep`):
   ```bash
   cd /Users/eric/work/metabase-rn
   mkdir -p src/api src/auth src/store src/ui/components src/lib
   touch src/api/.gitkeep src/auth/.gitkeep src/store/.gitkeep src/ui/components/.gitkeep src/lib/.gitkeep
   ```

3. Add a `metro.config.js` alias is NOT required (Expo Router + Babel resolve `tsconfig` `paths` automatically via `babel-preset-expo`'s `tsconfigPaths`), but confirm resolution by creating a throwaway import check in the next task's smoke test. For now, verify typecheck wiring is present:
   ```bash
   cd /Users/eric/work/metabase-rn
   npx tsc --noEmit
   ```
   Expected: exits `0` with no output (the default template's example files are already strict-clean). If the default template's example screens emit strict errors, that's acceptable to leave for the screens-owning engineer — but the command must run and report TS errors by file/line, proving the config is active.

4. Commit:
   ```bash
   git add -A
   git commit -m "chore: configure tsconfig strict mode and @/* path alias"
   ```

---

### Task 4: ESLint + Prettier config and npm scripts

**Files:**
- Create: `/Users/eric/work/metabase-rn/.eslintrc.js`
- Create: `/Users/eric/work/metabase-rn/.eslintignore`
- Create: `/Users/eric/work/metabase-rn/.prettierrc.json`
- Create: `/Users/eric/work/metabase-rn/.prettierignore`
- Modify: `/Users/eric/work/metabase-rn/package.json` (scripts block)
- Test: none (config) — verified by running the scripts

1. Create `/Users/eric/work/metabase-rn/.eslintrc.js` exactly:
   ```js
   // ESLint config: Expo's shared config + Prettier integration.
   module.exports = {
     root: true,
     extends: ['expo', 'plugin:prettier/recommended'],
     plugins: ['prettier'],
     rules: {
       'prettier/prettier': 'error',
     },
     ignorePatterns: [
       'node_modules/',
       'dist/',
       '.expo/',
       'coverage/',
       'babel.config.js',
     ],
   };
   ```
   `plugin:prettier/recommended` (from `eslint-plugin-prettier` + `eslint-config-prettier`) turns off ESLint formatting rules that fight Prettier and surfaces Prettier diffs as lint errors.

2. Create `/Users/eric/work/metabase-rn/.eslintignore` exactly:
   ```
   node_modules/
   dist/
   .expo/
   coverage/
   *.config.js
   ```

3. Create `/Users/eric/work/metabase-rn/.prettierrc.json` exactly:
   ```json
   {
     "semi": true,
     "singleQuote": true,
     "trailingComma": "all",
     "printWidth": 100,
     "tabWidth": 2,
     "arrowParens": "always"
   }
   ```

4. Create `/Users/eric/work/metabase-rn/.prettierignore` exactly:
   ```
   node_modules/
   dist/
   .expo/
   coverage/
   package-lock.json
   ```

5. Open `/Users/eric/work/metabase-rn/package.json` and set the `"scripts"` block to exactly (merge with the existing `expo`/`start` scripts the template generated — keep `start`, `android`, `ios`, `web`; add the four below):
   ```json
   "scripts": {
     "start": "expo start",
     "android": "expo start --android",
     "ios": "expo start --ios",
     "web": "expo start --web",
     "lint": "eslint . --ext .ts,.tsx,.js,.jsx --max-warnings=0",
     "typecheck": "tsc --noEmit",
     "test": "jest",
     "test:watch": "jest --watch"
   }
   ```

6. Run lint and typecheck to confirm both wire up (the smoke test in Task 5 will confirm `test`):
   ```bash
   cd /Users/eric/work/metabase-rn
   npm run typecheck
   npm run lint
   ```
   Expected: `typecheck` exits `0` silently; `lint` either exits `0` ("no errors") or prints actionable file/line lint errors from the template's example files (fix or `// eslint-disable` as needed so it exits `0`). Both commands must run, proving the scripts are wired.

7. Commit:
   ```bash
   git add -A
   git commit -m "chore: add eslint, prettier, and lint/typecheck/test scripts"
   ```

---

### Task 5: Jest setup (jest-expo) + RNTL + module mocks + smoke test

**Files:**
- Create: `/Users/eric/work/metabase-rn/jest.config.js`
- Create: `/Users/eric/work/metabase-rn/jest.setup.ts`
- Create: `/Users/eric/work/metabase-rn/src/__tests__/smoke.test.tsx`
- Modify: none
- Test: `/Users/eric/work/metabase-rn/src/__tests__/smoke.test.tsx` (the trivial render test, TDD-style)

1. Create `/Users/eric/work/metabase-rn/jest.config.js` exactly:
   ```js
   /** @type {import('jest').Config} */
   module.exports = {
     preset: 'jest-expo',
     setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
     // Transpile RN/Expo/3rd-party ESM packages that ship untranspiled.
     transformIgnorePatterns: [
       'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/react-native-skia|react-native-reanimated|victory-native|@react-native-google-signin/.*|@tanstack/.*))',
     ],
     moduleNameMapper: {
       '^@/(.*)$': '<rootDir>/src/$1',
       '^@/app/(.*)$': '<rootDir>/app/$1',
     },
     collectCoverageFrom: [
       'src/**/*.{ts,tsx}',
       'app/**/*.{ts,tsx}',
       '!**/*.d.ts',
       '!**/__tests__/**',
       '!**/node_modules/**',
     ],
     clearMocks: true,
   };
   ```
   The `moduleNameMapper` mirrors the `tsconfig` `@/*` alias so tests resolve it. `transformIgnorePatterns` whitelists the native/ESM packages so Jest transpiles them instead of choking on their ESM syntax.

2. Create `/Users/eric/work/metabase-rn/jest.setup.ts` exactly. This mocks every native module the test environment can't load (`expo-secure-store`, `expo-local-authentication`, google-signin, reanimated, skia):
   ```ts
   /* eslint-disable @typescript-eslint/no-var-requires */
   import '@testing-library/jest-native/extend-expect';

   // ---- expo-secure-store: in-memory key/value store ----
   jest.mock('expo-secure-store', () => {
     const store = new Map<string, string>();
     return {
       setItemAsync: jest.fn(async (k: string, v: string) => {
         store.set(k, v);
       }),
       getItemAsync: jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
       deleteItemAsync: jest.fn(async (k: string) => {
         store.delete(k);
       }),
       // expose for test resets if needed
       __store: store,
     };
   });

   // ---- expo-local-authentication: available + succeeds by default ----
   jest.mock('expo-local-authentication', () => ({
     hasHardwareAsync: jest.fn(async () => true),
     isEnrolledAsync: jest.fn(async () => true),
     supportedAuthenticationTypesAsync: jest.fn(async () => [1, 2]),
     authenticateAsync: jest.fn(async () => ({ success: true })),
   }));

   // ---- @react-native-google-signin/google-signin ----
   jest.mock('@react-native-google-signin/google-signin', () => ({
     GoogleSignin: {
       configure: jest.fn(),
       hasPlayServices: jest.fn(async () => true),
       signIn: jest.fn(async () => ({
         data: { idToken: 'test-id-token', user: { email: 'test@example.com' } },
       })),
       signOut: jest.fn(async () => undefined),
       getTokens: jest.fn(async () => ({ idToken: 'test-id-token', accessToken: 'test-access' })),
     },
     statusCodes: {
       SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
       IN_PROGRESS: 'IN_PROGRESS',
       PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
     },
     GoogleSigninButton: () => null,
   }));

   // ---- react-native-reanimated: official mock + silence the worklet warning ----
   jest.mock('react-native-reanimated', () => {
     const Reanimated = require('react-native-reanimated/mock');
     // The mock's `call` is a no-op; that's fine for unit tests.
     Reanimated.default.call = () => {};
     return Reanimated;
   });

   // ---- @shopify/react-native-skia: stub the Skia surface so charts don't load native code ----
   jest.mock('@shopify/react-native-skia', () => ({
     Canvas: ({ children }: { children?: unknown }) => children ?? null,
     Path: () => null,
     Group: ({ children }: { children?: unknown }) => children ?? null,
     Skia: {
       Path: { Make: jest.fn(() => ({ moveTo: jest.fn(), lineTo: jest.fn() })) },
     },
     useFont: jest.fn(() => null),
   }));

   // Silence noisy native warnings in test output.
   jest.spyOn(console, 'warn').mockImplementation((msg?: unknown) => {
     if (typeof msg === 'string' && /Reanimated|Skia/.test(msg)) return;
     // eslint-disable-next-line no-console
     (console.warn as unknown as { _original?: (...a: unknown[]) => void })._original?.(msg);
   });
   ```

3. **Write the failing smoke test.** Create `/Users/eric/work/metabase-rn/src/__tests__/smoke.test.tsx` exactly:
   ```tsx
   import { render, screen } from '@testing-library/react-native';
   import { Text } from 'react-native';

   describe('test harness smoke test', () => {
     it('renders a Text node', () => {
       render(<Text>Metabase Companion</Text>);
       expect(screen.getByText('Metabase Companion')).toBeTruthy();
     });

     it('loads the secure-store mock without touching native code', async () => {
       const SecureStore = await import('expo-secure-store');
       await SecureStore.setItemAsync('k', 'v');
       expect(await SecureStore.getItemAsync('k')).toBe('v');
     });
   });
   ```

4. **Run it, expect FAIL** (the config/setup files don't exist yet on a fresh checkout, or a path is wrong — run before finalizing to prove the harness reports failures):
   ```bash
   cd /Users/eric/work/metabase-rn
   npm test
   ```
   If `jest.config.js`/`jest.setup.ts` were missing or misnamed, expected output is a failure like:
   ```
   ● Test suite failed to run
     Cannot find module 'expo-secure-store' from 'src/__tests__/smoke.test.tsx'
   ```
   (or a preset-not-found error). This proves the runner surfaces failures.

5. **Implement** — with the `jest.config.js` and `jest.setup.ts` from steps 1–2 in place, the failure resolves. (No further code needed; the "implementation" is the config + mocks above.)

6. **Run, expect PASS:**
   ```bash
   cd /Users/eric/work/metabase-rn
   npm test
   ```
   Expected output ends with:
   ```
   PASS  src/__tests__/smoke.test.tsx
     test harness smoke test
       ✓ renders a Text node
       ✓ loads the secure-store mock without touching native code

   Test Suites: 1 passed, 1 total
   Tests:       2 passed, 2 total
   ```

7. Commit:
   ```bash
   git add -A
   git commit -m "test: configure jest-expo harness with native module mocks and smoke test"
   ```

---

### Task 6: GitHub Actions CI workflow

**Files:**
- Create: `/Users/eric/work/metabase-rn/.github/workflows/ci.yml`
- Test: none (CI config) — verified on next push/PR

1. Create the directory and file:
   ```bash
   mkdir -p /Users/eric/work/metabase-rn/.github/workflows
   ```

2. Create `/Users/eric/work/metabase-rn/.github/workflows/ci.yml` exactly:
   ```yaml
   name: CI

   on:
     push:
       branches: [main]
     pull_request:
       branches: [main]

   # Cancel superseded runs on the same ref to save CI minutes.
   concurrency:
     group: ci-${{ github.ref }}
     cancel-in-progress: true

   jobs:
     verify:
       name: Typecheck, Lint & Test
       runs-on: ubuntu-latest
       steps:
         - name: Checkout
           uses: actions/checkout@v4

         - name: Setup Node
           uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: npm

         - name: Install dependencies
           run: npm ci

         - name: Typecheck
           run: npm run typecheck

         - name: Lint
           run: npm run lint

         - name: Test
           run: npm test -- --ci --coverage --maxWorkers=2
   ```
   Notes: `npm ci` requires a committed `package-lock.json` (present after Task 2's `npm install`). Node 20 matches the current Expo SDK's supported LTS. `--ci` makes Jest fail on unexpected snapshots; `--maxWorkers=2` keeps it stable on GitHub's 2-core runners.

3. (Optional local dry-run if `act` is installed; otherwise skip — it's verified by the first push.) Verify the YAML at least parses:
   ```bash
   cd /Users/eric/work/metabase-rn
   npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "YAML OK"
   ```
   Expected: `YAML OK`.

4. Commit:
   ```bash
   git add -A
   git commit -m "ci: add GitHub Actions workflow for typecheck, lint, and test"
   ```

---

### Task 7: OSS hygiene files (README, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE, CHANGELOG)

**Files:**
- Create: `/Users/eric/work/metabase-rn/README.md`
- Create: `/Users/eric/work/metabase-rn/CONTRIBUTING.md`
- Create: `/Users/eric/work/metabase-rn/CODE_OF_CONDUCT.md`
- Create: `/Users/eric/work/metabase-rn/LICENSE`
- Create: `/Users/eric/work/metabase-rn/CHANGELOG.md`
- Test: none (docs)

1. Create `/Users/eric/work/metabase-rn/README.md` exactly:
   ````markdown
   # Metabase Companion

   A read-only, open-source mobile client for **any** [Metabase](https://www.metabase.com/) instance — Metabase Cloud or self-hosted, OSS/Pro/EE. Built with React Native (Expo).

   > **Unofficial.** Metabase Companion is a community project and is **not affiliated with, endorsed by, or sponsored by Metabase, Inc.** "Metabase" is a trademark of Metabase, Inc., used here only to describe interoperability.

   ## What it is

   - Connect to any Metabase instance you already have access to (minimum Metabase **v0.48+**).
   - Browse and view your dashboards and questions from your phone.
   - **Read-only:** the app never creates, edits, or deletes content in your Metabase instance.
   - No backend of ours: the app talks **directly** to the Metabase REST API. Your credentials and session tokens stay on your device (session tokens in the OS secure keystore via `expo-secure-store`).
   - Supports password login and Google sign-in (when your instance enables it), with optional biometric unlock.

   ## Quickstart (development)

   ```bash
   git clone <this-repo-url>
   cd metabase-rn
   npm install
   npm start          # starts the Metro dev server
   ```

   Then open the project in a simulator/emulator or a development build (see below).

   ### Scripts

   | Command              | Description                          |
   | -------------------- | ------------------------------------ |
   | `npm start`          | Start the Expo dev server            |
   | `npm run ios`        | Start + open iOS simulator           |
   | `npm run android`    | Start + open Android emulator        |
   | `npm run typecheck`  | TypeScript type-check (no emit)      |
   | `npm run lint`       | ESLint (Expo config + Prettier)      |
   | `npm test`           | Run the Jest test suite              |
   | `npm run test:watch` | Run Jest in watch mode               |

   ### Development build required for some features

   Google sign-in (`@react-native-google-signin/google-signin`) and native chart rendering
   (`@shopify/react-native-skia`) use custom native code and **do not run in Expo Go**. To exercise
   those features you need a **development build**:

   ```bash
   npx expo run:ios       # or: npx expo run:android
   # or build with EAS:  npx eas build --profile development
   ```

   Everything else runs in Expo Go for fast iteration.

   ## Tech stack

   Expo (managed) · TypeScript (strict) · Expo Router · TanStack Query · Zustand · Zod ·
   i18next (en/zh) · expo-secure-store · expo-local-authentication · Victory Native + Skia (charts).

   ## Contributing

   See [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md).

   ## License

   [MIT](./LICENSE) © 2026 Metabase Companion contributors.
   ````

2. Create `/Users/eric/work/metabase-rn/CONTRIBUTING.md` exactly:
   ````markdown
   # Contributing to Metabase Companion

   Thanks for your interest! This is an unofficial, community-run, read-only Metabase client.
   Contributions of all kinds are welcome.

   ## Getting set up

   ```bash
   npm install
   npm start
   ```

   For features that touch native code (Google sign-in, native charts), build a development
   build with `npx expo run:ios` / `npx expo run:android` — Expo Go cannot load those modules.

   ## Before you open a pull request

   Run the full local check suite; **all three must pass** (CI runs the same):

   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```

   ## Guidelines

   - **TypeScript strict mode** is on. No `any` escapes; prefer precise types and Zod schemas at API boundaries.
   - **Test logic.** Anything with branching/parsing/state gets a test. We use `jest-expo`,
     `@testing-library/react-native`, and `msw` (for HTTP).
   - **Read-only invariant.** Never add code that mutates a user's Metabase instance (no POST/PUT/PATCH/DELETE
     to content endpoints; auth/session endpoints are the only writes).
   - **Conventional Commits** for messages, e.g. `feat: add instance switcher`, `fix: handle 401 retry`.
   - **Keep secrets on device.** Session tokens live only in `expo-secure-store`; never log them.
   - Update `CHANGELOG.md` under `## [Unreleased]` for user-facing changes.

   ## Reporting bugs / requesting features

   Open a GitHub issue with steps to reproduce, your Metabase version, and the app version.
   Please **never** paste real session tokens, passwords, or instance URLs you don't want public.

   ## License of contributions

   By contributing, you agree your contributions are licensed under the project's [MIT License](./LICENSE).
   ````

3. Create `/Users/eric/work/metabase-rn/CODE_OF_CONDUCT.md` exactly:
   ````markdown
   # Code of Conduct

   ## Our Pledge

   We as members, contributors, and leaders pledge to make participation in our community a
   harassment-free experience for everyone, regardless of age, body size, visible or invisible
   disability, ethnicity, sex characteristics, gender identity and expression, level of experience,
   education, socio-economic status, nationality, personal appearance, race, religion, or sexual
   identity and orientation.

   ## Our Standards

   Examples of behavior that contributes to a positive environment:

   - Demonstrating empathy and kindness toward other people
   - Being respectful of differing opinions, viewpoints, and experiences
   - Giving and gracefully accepting constructive feedback
   - Accepting responsibility and apologizing to those affected by our mistakes

   Examples of unacceptable behavior:

   - The use of sexualized language or imagery, and sexual attention or advances of any kind
   - Trolling, insulting or derogatory comments, and personal or political attacks
   - Public or private harassment
   - Publishing others' private information without their explicit permission

   ## Enforcement Responsibilities

   Community maintainers are responsible for clarifying and enforcing our standards and will take
   appropriate and fair corrective action in response to any behavior they deem inappropriate.

   ## Scope

   This Code of Conduct applies within all community spaces and when an individual is officially
   representing the community in public spaces.

   ## Enforcement

   Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the
   maintainers at **engineering@month2month.com**. All complaints will be reviewed and investigated
   promptly and fairly. Maintainers are obligated to respect the privacy and security of the reporter.

   ## Attribution

   This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org),
   version 2.1, available at
   <https://www.contributor-covenant.org/version/2/1/code_of_conduct.html>.
   ````

4. Create `/Users/eric/work/metabase-rn/LICENSE` exactly (full MIT text, year 2026):
   ```
   MIT License

   Copyright (c) 2026 Metabase Companion contributors

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
   ```

5. Create `/Users/eric/work/metabase-rn/CHANGELOG.md` exactly:
   ````markdown
   # Changelog

   All notable changes to this project will be documented in this file.

   The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
   and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

   ## [Unreleased]

   ### Added

   - Project scaffold: Expo (managed) + TypeScript (strict) + Expo Router.
   - Tooling: ESLint (eslint-config-expo) + Prettier, `typecheck`/`lint`/`test` scripts.
   - Testing harness: jest-expo + @testing-library/react-native + MSW, with native-module mocks.
   - Continuous integration: GitHub Actions running typecheck, lint, and tests.
   - OSS hygiene: README, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE (MIT), CHANGELOG.
   ````

6. Commit:
   ```bash
   cd /Users/eric/work/metabase-rn
   git add -A
   git commit -m "docs: add README, CONTRIBUTING, CODE_OF_CONDUCT, LICENSE, and CHANGELOG"
   ```

---

### Task 8: App config (`app.json`) — name, slug, scheme, and config plugins

**Files:**
- Modify: `/Users/eric/work/metabase-rn/app.json`
- Test: none (config) — verified by `expo-doctor` / `expo prebuild` dry run

1. Replace the contents of `/Users/eric/work/metabase-rn/app.json` with exactly the following. Keep any `icon`/`splash` asset paths the template generated if they differ — the load-bearing parts are `name`, `slug`, `scheme`, `plugins`, and the `newArchEnabled` flag that Skia/Reanimated benefit from:
   ```json
   {
     "expo": {
       "name": "Metabase Companion",
       "slug": "metabase-companion",
       "scheme": "metabase-companion",
       "version": "0.1.0",
       "orientation": "portrait",
       "icon": "./assets/images/icon.png",
       "userInterfaceStyle": "automatic",
       "newArchEnabled": true,
       "ios": {
         "supportsTablet": true,
         "bundleIdentifier": "com.metabasecompanion.app"
       },
       "android": {
         "package": "com.metabasecompanion.app",
         "adaptiveIcon": {
           "foregroundImage": "./assets/images/adaptive-icon.png",
           "backgroundColor": "#ffffff"
         }
       },
       "web": {
         "bundler": "metro",
         "output": "static",
         "favicon": "./assets/images/favicon.png"
       },
       "plugins": [
         "expo-router",
         "expo-secure-store",
         "expo-localization",
         [
           "@react-native-google-signin/google-signin",
           {
             "iosUrlScheme": "com.googleusercontent.apps.REPLACE_WITH_REVERSED_CLIENT_ID"
           }
         ]
       ],
       "experiments": {
         "typedRoutes": true
       }
     }
   }
   ```
   Notes:
   - `expo-secure-store` is added to `plugins` so its Face ID usage string / keychain entitlement are configured for dev/prod builds.
   - `expo-local-authentication` does not strictly need a plugin entry for basic use, but if you want a custom iOS Face ID prompt string, add `["expo-local-authentication", { "faceIDPermission": "Use Face ID to unlock Metabase Companion." }]` to `plugins`.
   - The google-signin `iosUrlScheme` is your **reversed iOS OAuth client ID** (looks like `com.googleusercontent.apps.1234567890-abcdef`). It's a per-deployment value; the `REPLACE_WITH_REVERSED_CLIENT_ID` placeholder is intentional and documented in CONTRIBUTING/SETUP for whoever provisions OAuth. This is the one allowed placeholder because it's environment-specific secret-ish config, not application code.
   - If the template generated icon/splash paths under `./assets/` (not `./assets/images/`), keep the template's paths rather than the ones above to avoid breaking the build.

2. Verify the config is valid and plugins resolve (a prebuild dry run evaluates every config plugin without writing native dirs):
   ```bash
   cd /Users/eric/work/metabase-rn
   npx expo config --type prebuild > /dev/null && echo "CONFIG OK"
   ```
   Expected: `CONFIG OK`. If a plugin name is wrong, Expo prints `PluginError: Failed to resolve plugin for module "<name>"` — fix the name. The google-signin plugin resolves even with the placeholder `iosUrlScheme` (the value is only consumed at actual prebuild/native-build time).

3. Confirm the app still boots with the new config:
   ```bash
   cd /Users/eric/work/metabase-rn
   npx expo start --no-dev --clear
   ```
   Expected: Metro starts and shows the app name `Metabase Companion`. Press `Ctrl-C`.

4. Commit:
   ```bash
   git add -A
   git commit -m "chore: configure app name, scheme, and native config plugins"
   ```

---

Files relevant to this section (all under `/Users/eric/work/metabase-rn/`): `package.json`, `tsconfig.json`, `babel.config.js`, `.eslintrc.js`, `.eslintignore`, `.prettierrc.json`, `.prettierignore`, `jest.config.js`, `jest.setup.ts`, `src/__tests__/smoke.test.tsx`, `.github/workflows/ci.yml`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `CHANGELOG.md`, `app.json`, `.gitignore`.

Sources: [create-expo-app docs](https://docs.expo.dev/more/create-expo/), [React Native Google Sign-In — Expo setup](https://react-native-google-signin.github.io/docs/setting-up/expo), [Expo Google authentication guide](https://docs.expo.dev/guides/google-authentication/)

---

### Task 9: `normalizeBaseUrl` in `src/lib/url.ts`

**Files:**
- Create: `src/lib/url.ts`
- Test: `src/lib/url.test.ts`

This is a pure function with branching logic, so we do strict TDD. Metabase base URLs can look like `metabase.example.com`, `https://mb.acme.io:3000`, or `http://localhost:3000/metabase`. We must: trim, add `https://` if there is no scheme, keep an explicit `http://`, drop a single trailing slash, preserve port and subpath, and throw `Error('Invalid URL')` for empty/garbage input. We use the Hermes `URL` global (available in React Native / Hermes and in the jest-expo Node environment) for parsing.

1. Create the directory: `mkdir -p src/lib`.

2. Write the failing test. Create `src/lib/url.test.ts` with this exact content:
   ```ts
   import { normalizeBaseUrl } from './url';

   describe('normalizeBaseUrl', () => {
     it('adds https:// when scheme is missing', () => {
       expect(normalizeBaseUrl('metabase.example.com')).toBe('https://metabase.example.com');
     });

     it('keeps http:// when explicitly present', () => {
       expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
     });

     it('keeps https:// when explicitly present', () => {
       expect(normalizeBaseUrl('https://mb.acme.io')).toBe('https://mb.acme.io');
     });

     it('trims surrounding whitespace', () => {
       expect(normalizeBaseUrl('  metabase.example.com  ')).toBe('https://metabase.example.com');
     });

     it('strips a single trailing slash', () => {
       expect(normalizeBaseUrl('https://mb.acme.io/')).toBe('https://mb.acme.io');
     });

     it('preserves an explicit port', () => {
       expect(normalizeBaseUrl('mb.acme.io:3000')).toBe('https://mb.acme.io:3000');
     });

     it('preserves a subpath and strips its trailing slash', () => {
       expect(normalizeBaseUrl('http://localhost:3000/metabase/')).toBe('http://localhost:3000/metabase');
     });

     it('preserves a subpath without a trailing slash', () => {
       expect(normalizeBaseUrl('https://acme.io/tools/metabase')).toBe('https://acme.io/tools/metabase');
     });

     it("throws Error('Invalid URL') on empty string", () => {
       expect(() => normalizeBaseUrl('')).toThrow('Invalid URL');
     });

     it("throws Error('Invalid URL') on whitespace-only string", () => {
       expect(() => normalizeBaseUrl('   ')).toThrow('Invalid URL');
     });

     it("throws Error('Invalid URL') on garbage input", () => {
       expect(() => normalizeBaseUrl('ht!tp://%%%not a url')).toThrow('Invalid URL');
     });

     it("throws Error('Invalid URL') on a scheme with no host", () => {
       expect(() => normalizeBaseUrl('https://')).toThrow('Invalid URL');
     });
   });
   ```

3. Run it, expect FAIL:
   - Command: `npm test -- src/lib/url.test.ts`
   - Expected output contains: `Cannot find module './url'` (the module does not exist yet), and the run ends with `Tests: ... failed`.

4. Implement. Create `src/lib/url.ts` with this exact content:
   ```ts
   /**
    * Normalizes a user-entered Metabase base URL.
    * - trims whitespace
    * - prepends 'https://' when no scheme is present
    * - keeps an explicit 'http://' or 'https://'
    * - removes a single trailing slash (but preserves subpaths)
    * - preserves port and subpath
    * @throws Error('Invalid URL') when input is empty or cannot be parsed.
    */
   export function normalizeBaseUrl(input: string): string {
     const trimmed = input.trim();
     if (trimmed === '') {
       throw new Error('Invalid URL');
     }

     const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
       ? trimmed
       : `https://${trimmed}`;

     let parsed: URL;
     try {
       parsed = new URL(withScheme);
     } catch {
       throw new Error('Invalid URL');
     }

     if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
       throw new Error('Invalid URL');
     }
     if (parsed.hostname === '') {
       throw new Error('Invalid URL');
     }

     // Rebuild from parsed parts so we control trailing-slash handling exactly.
     // parsed.pathname is '/' for a bare host; collapse that to '' and otherwise
     // strip a single trailing slash.
     const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
     return `${parsed.protocol}//${parsed.host}${path}`;
   }
   ```
   Notes for the engineer: `parsed.host` includes the port when present (e.g. `localhost:3000`), so port preservation is free. `URL` is a global in Hermes and in the jest Node environment, so no import is needed. We deliberately do not include `parsed.search`/`parsed.hash` — a base URL should never carry those.

5. Run, expect PASS:
   - Command: `npm test -- src/lib/url.test.ts`
   - Expected output contains: `Tests:       12 passed, 12 total`.

6. Commit:
   ```sh
   git add src/lib/url.ts src/lib/url.test.ts
   git commit -m "feat(lib): add normalizeBaseUrl with full validation"
   ```

---

### Task 10: API error types in `src/api/errors.ts`

**Files:**
- Create: `src/api/errors.ts`
- Test: `src/api/errors.test.ts`

The `ApiError` union is a type only (no runtime), so it cannot be unit-tested directly; the testable runtime is the `ApiException` class, which must carry its `.error` payload and set `.message` to the error `kind`.

1. Create the directory: `mkdir -p src/api`.

2. Write the failing test. Create `src/api/errors.test.ts` with this exact content:
   ```ts
   import { ApiException, type ApiError } from './errors';

   describe('ApiException', () => {
     it('carries the structured error on .error', () => {
       const err: ApiError = { kind: 'server', status: 500, message: 'boom' };
       const ex = new ApiException(err);
       expect(ex.error).toBe(err);
     });

     it('is an instance of Error', () => {
       const ex = new ApiException({ kind: 'unauthorized' });
       expect(ex).toBeInstanceOf(Error);
     });

     it('sets .message to the error kind', () => {
       const ex = new ApiException({ kind: 'notFound' });
       expect(ex.message).toBe('notFound');
     });

     it('exposes a network error message', () => {
       const ex = new ApiException({ kind: 'network', message: 'offline' });
       expect(ex.error).toEqual({ kind: 'network', message: 'offline' });
     });
   });
   ```

3. Run it, expect FAIL:
   - Command: `npm test -- src/api/errors.test.ts`
   - Expected output contains: `Cannot find module './errors'`, run ends `Tests: ... failed`.

4. Implement. Create `src/api/errors.ts` with this exact content:
   ```ts
   export type ApiError =
     | { kind: 'network'; message: string }
     | { kind: 'unauthorized' } // HTTP 401
     | { kind: 'forbidden' } // HTTP 403
     | { kind: 'notFound' } // HTTP 404
     | { kind: 'server'; status: number; message: string }
     | { kind: 'parse'; message: string };

   export class ApiException extends Error {
     constructor(public readonly error: ApiError) {
       super(error.kind);
       this.name = 'ApiException';
       // Restore the prototype chain (TS target downlevels `extends Error`).
       Object.setPrototypeOf(this, ApiException.prototype);
     }
   }
   ```

5. Run, expect PASS:
   - Command: `npm test -- src/api/errors.test.ts`
   - Expected output contains: `Tests:       4 passed, 4 total`.

6. Commit:
   ```sh
   git add src/api/errors.ts src/api/errors.test.ts
   git commit -m "feat(api): add ApiError union and ApiException"
   ```

---

### Task 11: Zod schemas in `src/api/schemas.ts`

**Files:**
- Create: `src/api/schemas.ts`
- Test: `src/api/schemas.test.ts`

We map Metabase's raw kebab/snake-case API JSON into the camelCase interfaces from the contract using `zod` `.transform`. Key subtleties: `GET /api/session/properties` returns `version` as an object like `{ tag: 'v0.49.0', date: '...', ... }` — we extract `tag` (default `''` if missing); `enable-password-login` defaults to `true` when absent; `google-auth-client-id` may be `null`. Unknown extra keys must be ignored (Metabase returns dozens of settings we do not care about).

This assumes `zod` is installed. If `npm test` later reports `Cannot find module 'zod'`, run `npx expo install zod` first.

1. Write the failing test. Create `src/api/schemas.test.ts` with this exact content:
   ```ts
   import {
     SessionPropertiesSchema,
     CurrentUserSchema,
     SessionTokenSchema,
   } from './schemas';

   describe('SessionPropertiesSchema', () => {
     const raw = {
       'site-name': 'Acme Analytics',
       version: { tag: 'v0.49.0', date: '2024-01-01', major: 49 },
       'google-auth-client-id': '123-abc.apps.googleusercontent.com',
       'enable-password-login': true,
       'google-auth-enabled': true,
       // extra unknown settings Metabase actually returns:
       'application-name': 'Metabase',
       'available-locales': [['en', 'English']],
     };

     it('maps kebab keys to camelCase and extracts version.tag', () => {
       expect(SessionPropertiesSchema.parse(raw)).toEqual({
         siteName: 'Acme Analytics',
         version: 'v0.49.0',
         googleAuthClientId: '123-abc.apps.googleusercontent.com',
         passwordLoginEnabled: true,
       });
     });

     it('defaults passwordLoginEnabled to true when enable-password-login is absent', () => {
       const { 'enable-password-login': _omit, ...rest } = raw;
       expect(SessionPropertiesSchema.parse(rest).passwordLoginEnabled).toBe(true);
     });

     it('respects enable-password-login=false', () => {
       expect(
         SessionPropertiesSchema.parse({ ...raw, 'enable-password-login': false })
           .passwordLoginEnabled,
       ).toBe(false);
     });

     it('treats null google-auth-client-id as null', () => {
       expect(
         SessionPropertiesSchema.parse({ ...raw, 'google-auth-client-id': null })
           .googleAuthClientId,
       ).toBeNull();
     });

     it('defaults version to empty string when version is absent', () => {
       const { version: _omit, ...rest } = raw;
       expect(SessionPropertiesSchema.parse(rest).version).toBe('');
     });

     it('defaults version to empty string when version.tag is absent', () => {
       expect(
         SessionPropertiesSchema.parse({ ...raw, version: { date: '2024-01-01' } }).version,
       ).toBe('');
     });

     it('defaults siteName to empty string when site-name is absent', () => {
       const { 'site-name': _omit, ...rest } = raw;
       expect(SessionPropertiesSchema.parse(rest).siteName).toBe('');
     });
   });

   describe('CurrentUserSchema', () => {
     it('maps snake_case to camelCase', () => {
       expect(
         CurrentUserSchema.parse({
           id: 7,
           email: 'jo@acme.io',
           first_name: 'Jo',
           last_name: 'Smith',
           is_superuser: true,
           common_name: 'Jo Smith', // unknown extra key ignored
         }),
       ).toEqual({
         id: 7,
         email: 'jo@acme.io',
         firstName: 'Jo',
         lastName: 'Smith',
         isSuperuser: true,
       });
     });

     it('allows null first_name and last_name', () => {
       const parsed = CurrentUserSchema.parse({
         id: 7,
         email: 'jo@acme.io',
         first_name: null,
         last_name: null,
         is_superuser: false,
       });
       expect(parsed.firstName).toBeNull();
       expect(parsed.lastName).toBeNull();
     });

     it('rejects a payload missing email', () => {
       expect(() => CurrentUserSchema.parse({ id: 7, is_superuser: false })).toThrow();
     });
   });

   describe('SessionTokenSchema', () => {
     it('parses { id }', () => {
       expect(SessionTokenSchema.parse({ id: 'abc-123' })).toEqual({ id: 'abc-123' });
     });

     it('ignores extra keys', () => {
       expect(SessionTokenSchema.parse({ id: 'abc-123', extra: 1 })).toEqual({ id: 'abc-123' });
     });

     it('rejects a payload missing id', () => {
       expect(() => SessionTokenSchema.parse({})).toThrow();
     });
   });
   ```

2. Run it, expect FAIL:
   - Command: `npm test -- src/api/schemas.test.ts`
   - Expected output contains: `Cannot find module './schemas'`, run ends `Tests: ... failed`.

3. Implement. Create `src/api/schemas.ts` with this exact content:
   ```ts
   import { z } from 'zod';

   // ---- SessionProperties (GET /api/session/properties) ----
   // Metabase returns a large flat settings object. We pick only the keys we
   // need and ignore everything else. `version` is an object; we extract `tag`.
   export interface SessionProperties {
     siteName: string;
     version: string;
     googleAuthClientId: string | null;
     passwordLoginEnabled: boolean;
   }

   const VersionSchema = z
     .object({ tag: z.string() })
     .partial()
     .passthrough()
     .optional()
     .nullable();

   export const SessionPropertiesSchema = z
     .object({
       'site-name': z.string().optional().nullable(),
       version: VersionSchema,
       'google-auth-client-id': z.string().optional().nullable(),
       'enable-password-login': z.boolean().optional(),
     })
     .passthrough()
     .transform(
       (raw): SessionProperties => ({
         siteName: raw['site-name'] ?? '',
         version: raw.version?.tag ?? '',
         googleAuthClientId: raw['google-auth-client-id'] ?? null,
         passwordLoginEnabled: raw['enable-password-login'] ?? true,
       }),
     );

   // ---- CurrentUser (GET /api/user/current) ----
   export interface CurrentUser {
     id: number;
     email: string;
     firstName: string | null;
     lastName: string | null;
     isSuperuser: boolean;
   }

   export const CurrentUserSchema = z
     .object({
       id: z.number(),
       email: z.string(),
       first_name: z.string().nullable().optional(),
       last_name: z.string().nullable().optional(),
       is_superuser: z.boolean(),
     })
     .passthrough()
     .transform(
       (raw): CurrentUser => ({
         id: raw.id,
         email: raw.email,
         firstName: raw.first_name ?? null,
         lastName: raw.last_name ?? null,
         isSuperuser: raw.is_superuser,
       }),
     );

   // ---- SessionToken (POST /api/session and /api/session/google_auth) ----
   export interface SessionToken {
     id: string;
   }

   export const SessionTokenSchema = z
     .object({ id: z.string() })
     .passthrough()
     .transform((raw): SessionToken => ({ id: raw.id }));
   ```
   Notes for the engineer: `.passthrough()` keeps unknown keys around through validation (they are then dropped by the explicit object the `.transform` returns), which is exactly the tolerance behavior we want. `.partial()` on `VersionSchema` makes `tag` optional so a `version` object without `tag` parses and falls back to `''`.

4. Run, expect PASS:
   - Command: `npm test -- src/api/schemas.test.ts`
   - Expected output contains: `Tests:       13 passed, 13 total`.

5. Commit:
   ```sh
   git add src/api/schemas.ts src/api/schemas.test.ts
   git commit -m "feat(api): add zod schemas for session properties, user, token"
   ```

---

### Task 12: `MetabaseClient` in `src/api/client.ts`

**Files:**
- Create: `src/api/client.ts`
- Test: `src/api/client.test.ts`
- Modify: `jest.config.js` (only if MSW polyfills are not already wired — see step 1)

This is the core HTTP client. It builds `baseUrl + path`, injects `Content-Type: application/json` and (when `getToken()` is non-null) `X-Metabase-Session`, parses JSON, validates with the caller's zod schema (throwing `{kind:'parse'}` on schema failure), and maps HTTP status to `ApiError`. On 401 it calls `onUnauthorized()` at most once; if that returns a new token it retries the request once with the new token, otherwise it throws `{kind:'unauthorized'}`. Network failures throw `{kind:'network'}`. `del()` resolves to `void`.

We test against a mocked HTTP API using MSW (node).

1. Ensure MSW and its polyfills work under jest-expo. MSW v2 needs `fetch`/`Response`/`TextEncoder` etc. in the Node test environment. Verify dev deps exist (install if missing):
   ```sh
   npm i -D msw whatwg-fetch
   ```
   Then ensure the jest setup polyfills are present. Open `jest.config.js`; it should already reference a setup file from the project-bootstrap task (e.g. `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']`). Confirm `jest.setup.ts` contains these lines (add them at the top if absent):
   ```ts
   import 'whatwg-fetch';
   import { TextEncoder, TextDecoder } from 'util';
   // @ts-expect-error - Node globals for MSW v2 in jsdom/node env
   global.TextEncoder = global.TextEncoder ?? TextEncoder;
   // @ts-expect-error
   global.TextDecoder = global.TextDecoder ?? TextDecoder;
   ```
   (If the bootstrap task already added `whatwg-fetch` + encoder polyfills, skip this — do not duplicate.)

2. Write the failing test. Create `src/api/client.test.ts` with this exact content:
   ```ts
   import { http, HttpResponse } from 'msw';
   import { setupServer } from 'msw/node';
   import { z } from 'zod';
   import { MetabaseClient } from './client';
   import { ApiException } from './errors';

   const BASE = 'https://mb.test';
   const PingSchema = z.object({ ok: z.boolean() });

   const server = setupServer();
   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
   afterEach(() => server.resetHandlers());
   afterAll(() => server.close());

   function makeClient(opts?: Partial<{
     getToken: () => string | null;
     onUnauthorized: () => Promise<string | null>;
   }>) {
     return new MetabaseClient({
       baseUrl: BASE,
       getToken: opts?.getToken ?? (() => null),
       onUnauthorized: opts?.onUnauthorized,
     });
   }

   describe('MetabaseClient.get', () => {
     it('fetches and validates a successful response', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () => HttpResponse.json({ ok: true })),
       );
       const client = makeClient();
       await expect(client.get('/api/ping', PingSchema)).resolves.toEqual({ ok: true });
     });

     it('injects X-Metabase-Session header when a token is present', async () => {
       let seen: string | null = null;
       server.use(
         http.get(`${BASE}/api/ping`, ({ request }) => {
           seen = request.headers.get('x-metabase-session');
           return HttpResponse.json({ ok: true });
         }),
       );
       const client = makeClient({ getToken: () => 'tok-1' });
       await client.get('/api/ping', PingSchema);
       expect(seen).toBe('tok-1');
     });

     it('omits X-Metabase-Session header when token is null', async () => {
       let hasHeader = true;
       server.use(
         http.get(`${BASE}/api/ping`, ({ request }) => {
           hasHeader = request.headers.has('x-metabase-session');
           return HttpResponse.json({ ok: true });
         }),
       );
       const client = makeClient({ getToken: () => null });
       await client.get('/api/ping', PingSchema);
       expect(hasHeader).toBe(false);
     });

     it('retries once with a new token when 401 and onUnauthorized returns a token', async () => {
       let calls = 0;
       server.use(
         http.get(`${BASE}/api/ping`, ({ request }) => {
           calls += 1;
           const tok = request.headers.get('x-metabase-session');
           if (tok === 'fresh') return HttpResponse.json({ ok: true });
           return new HttpResponse(null, { status: 401 });
         }),
       );
       const onUnauthorized = jest.fn(async () => 'fresh');
       const client = makeClient({ getToken: () => 'stale', onUnauthorized });
       await expect(client.get('/api/ping', PingSchema)).resolves.toEqual({ ok: true });
       expect(onUnauthorized).toHaveBeenCalledTimes(1);
       expect(calls).toBe(2);
     });

     it('throws unauthorized when 401 and onUnauthorized returns null', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 401 })),
       );
       const onUnauthorized = jest.fn(async () => null);
       const client = makeClient({ getToken: () => 'stale', onUnauthorized });
       await expect(client.get('/api/ping', PingSchema)).rejects.toMatchObject({
         error: { kind: 'unauthorized' },
       });
       expect(onUnauthorized).toHaveBeenCalledTimes(1);
     });

     it('throws unauthorized when 401 and no onUnauthorized hook is provided', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 401 })),
       );
       const client = makeClient({ getToken: () => 'stale' });
       await expect(client.get('/api/ping', PingSchema)).rejects.toMatchObject({
         error: { kind: 'unauthorized' },
       });
     });

     it('does not retry more than once even if 401 persists', async () => {
       let calls = 0;
       server.use(
         http.get(`${BASE}/api/ping`, () => {
           calls += 1;
           return new HttpResponse(null, { status: 401 });
         }),
       );
       const onUnauthorized = jest.fn(async () => 'still-bad');
       const client = makeClient({ getToken: () => 'stale', onUnauthorized });
       await expect(client.get('/api/ping', PingSchema)).rejects.toMatchObject({
         error: { kind: 'unauthorized' },
       });
       expect(onUnauthorized).toHaveBeenCalledTimes(1);
       expect(calls).toBe(2);
     });

     it('maps 403 to forbidden', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 403 })),
       );
       await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
         error: { kind: 'forbidden' },
       });
     });

     it('maps 404 to notFound', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 404 })),
       );
       await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
         error: { kind: 'notFound' },
       });
     });

     it('maps 500 to server with status and message', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () =>
           HttpResponse.json({ message: 'kaboom' }, { status: 500 }),
         ),
       );
       await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
         error: { kind: 'server', status: 500 },
       });
     });

     it('throws parse when the response does not match the schema', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () => HttpResponse.json({ ok: 'nope' })),
       );
       await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
         error: { kind: 'parse' },
       });
     });

     it('throws network when the request fails to reach the server', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () => HttpResponse.error()),
       );
       await expect(makeClient().get('/api/ping', PingSchema)).rejects.toMatchObject({
         error: { kind: 'network' },
       });
     });

     it('throws an ApiException instance', async () => {
       server.use(
         http.get(`${BASE}/api/ping`, () => new HttpResponse(null, { status: 404 })),
       );
       await expect(makeClient().get('/api/ping', PingSchema)).rejects.toBeInstanceOf(
         ApiException,
       );
     });
   });

   describe('MetabaseClient.post', () => {
     it('sends a JSON body and validates the response', async () => {
       let received: unknown = null;
       server.use(
         http.post(`${BASE}/api/session`, async ({ request }) => {
           received = await request.json();
           return HttpResponse.json({ ok: true });
         }),
       );
       const client = makeClient();
       await expect(
         client.post('/api/session', { username: 'a', password: 'b' }, PingSchema),
       ).resolves.toEqual({ ok: true });
       expect(received).toEqual({ username: 'a', password: 'b' });
     });

     it('sets Content-Type application/json on post', async () => {
       let contentType: string | null = null;
       server.use(
         http.post(`${BASE}/api/session`, ({ request }) => {
           contentType = request.headers.get('content-type');
           return HttpResponse.json({ ok: true });
         }),
       );
       await makeClient().post('/api/session', {}, PingSchema);
       expect(contentType).toContain('application/json');
     });
   });

   describe('MetabaseClient.del', () => {
     it('resolves void on success', async () => {
       server.use(
         http.delete(`${BASE}/api/session`, () => new HttpResponse(null, { status: 204 })),
       );
       await expect(makeClient().del('/api/session')).resolves.toBeUndefined();
     });

     it('maps a 401 on delete to unauthorized', async () => {
       server.use(
         http.delete(`${BASE}/api/session`, () => new HttpResponse(null, { status: 401 })),
       );
       await expect(makeClient().del('/api/session')).rejects.toMatchObject({
         error: { kind: 'unauthorized' },
       });
     });
   });
   ```

3. Run it, expect FAIL:
   - Command: `npm test -- src/api/client.test.ts`
   - Expected output contains: `Cannot find module './client'`, run ends `Tests: ... failed`.

4. Implement. Create `src/api/client.ts` with this exact content:
   ```ts
   import type { ZodType } from 'zod';
   import { ApiException, type ApiError } from './errors';

   export interface MetabaseClientOptions {
     baseUrl: string; // already normalized
     getToken: () => string | null; // current session token or null
     onUnauthorized?: () => Promise<string | null>; // re-auth hook; returns NEW token or null. Called at most once per request.
   }

   export class MetabaseClient {
     private readonly baseUrl: string;
     private readonly getToken: () => string | null;
     private readonly onUnauthorized?: () => Promise<string | null>;

     constructor(opts: MetabaseClientOptions) {
       this.baseUrl = opts.baseUrl;
       this.getToken = opts.getToken;
       this.onUnauthorized = opts.onUnauthorized;
     }

     async get<T>(path: string, schema: ZodType<T>): Promise<T> {
       const res = await this.request('GET', path, undefined);
       return this.parseBody(res, schema);
     }

     async post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
       const res = await this.request('POST', path, body);
       return this.parseBody(res, schema);
     }

     async del(path: string): Promise<void> {
       await this.request('DELETE', path, undefined);
     }

     /**
      * Performs the HTTP request, mapping status codes to ApiException and
      * implementing the 401 -> onUnauthorized -> retry-once flow.
      * Returns the raw Response for successful (2xx) requests.
      */
     private async request(
       method: 'GET' | 'POST' | 'DELETE',
       path: string,
       body: unknown,
       token: string | null = this.getToken(),
       isRetry = false,
     ): Promise<Response> {
       const headers: Record<string, string> = {
         'Content-Type': 'application/json',
         Accept: 'application/json',
       };
       if (token) {
         headers['X-Metabase-Session'] = token;
       }

       const init: RequestInit = { method, headers };
       if (body !== undefined) {
         init.body = JSON.stringify(body);
       }

       let res: Response;
       try {
         res = await fetch(`${this.baseUrl}${path}`, init);
       } catch (e) {
         throw new ApiException({
           kind: 'network',
           message: e instanceof Error ? e.message : 'Network request failed',
         });
       }

       if (res.ok) {
         return res;
       }

       if (res.status === 401) {
         if (!isRetry && this.onUnauthorized) {
           const fresh = await this.onUnauthorized();
           if (fresh) {
             return this.request(method, path, body, fresh, true);
           }
         }
         throw new ApiException({ kind: 'unauthorized' });
       }

       throw new ApiException(await this.mapErrorStatus(res));
     }

     private async mapErrorStatus(res: Response): Promise<ApiError> {
       if (res.status === 403) return { kind: 'forbidden' };
       if (res.status === 404) return { kind: 'notFound' };
       // 4xx (other) and 5xx -> server
       let message = res.statusText || `HTTP ${res.status}`;
       try {
         const data = await res.json();
         if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') {
           message = (data as { message: string }).message;
         }
       } catch {
         // body not JSON; keep the default message
       }
       return { kind: 'server', status: res.status, message };
     }

     private async parseBody<T>(res: Response, schema: ZodType<T>): Promise<T> {
       let json: unknown;
       try {
         json = await res.json();
       } catch (e) {
         throw new ApiException({
           kind: 'parse',
           message: e instanceof Error ? e.message : 'Failed to parse JSON',
         });
       }
       const result = schema.safeParse(json);
       if (!result.success) {
         throw new ApiException({ kind: 'parse', message: result.error.message });
       }
       return result.data;
     }
   }
   ```
   Notes for the engineer: the retry path threads the fresh token explicitly through `request(...)` with `isRetry = true`, guaranteeing `onUnauthorized` runs at most once per public call. `MSW`'s `HttpResponse.error()` rejects `fetch`, which is how the `network` test is exercised. `mapErrorStatus` reads Metabase's `{ message }` error body when present (it usually is) and otherwise falls back to a generic message.

5. Run, expect PASS:
   - Command: `npm test -- src/api/client.test.ts`
   - Expected output contains: `Tests:       18 passed, 18 total`.

6. Commit:
   ```sh
   git add src/api/client.ts src/api/client.test.ts jest.setup.ts
   git commit -m "feat(api): add MetabaseClient with auth headers, 401 retry, error mapping"
   ```

---

### Task 13: Endpoint helpers in `src/api/endpoints.ts`

**Files:**
- Create: `src/api/endpoints.ts`
- Test: `src/api/endpoints.test.ts`

Thin typed wrappers over `MetabaseClient` that the auth section will call. Each takes a `MetabaseClient` and uses the schemas from Task 11. We keep these minimal: `getCurrentUser`, `getSessionProperties` (authenticated variant — note the unauthenticated `fetchSessionProperties` lives in the auth section), and `deleteSession`. They are trivial delegations, but we TDD a couple to lock the paths and schema wiring, mocking the client so endpoints are tested in isolation from HTTP.

1. Write the failing test. Create `src/api/endpoints.test.ts` with this exact content:
   ```ts
   import { getCurrentUser, getSessionProperties, deleteSession } from './endpoints';
   import type { MetabaseClient } from './client';

   describe('endpoints', () => {
     it('getCurrentUser calls GET /api/user/current with CurrentUserSchema', async () => {
       const raw = {
         id: 7,
         email: 'jo@acme.io',
         first_name: 'Jo',
         last_name: 'Smith',
         is_superuser: true,
       };
       const get = jest.fn(async (_path: string, schema: { parse: (v: unknown) => unknown }) =>
         schema.parse(raw),
       );
       const client = { get } as unknown as MetabaseClient;

       const user = await getCurrentUser(client);

       expect(get).toHaveBeenCalledWith('/api/user/current', expect.anything());
       expect(user).toEqual({
         id: 7,
         email: 'jo@acme.io',
         firstName: 'Jo',
         lastName: 'Smith',
         isSuperuser: true,
       });
     });

     it('getSessionProperties calls GET /api/session/properties with SessionPropertiesSchema', async () => {
       const raw = {
         'site-name': 'Acme',
         version: { tag: 'v0.49.0' },
         'google-auth-client-id': null,
         'enable-password-login': true,
       };
       const get = jest.fn(async (_path: string, schema: { parse: (v: unknown) => unknown }) =>
         schema.parse(raw),
       );
       const client = { get } as unknown as MetabaseClient;

       const props = await getSessionProperties(client);

       expect(get).toHaveBeenCalledWith('/api/session/properties', expect.anything());
       expect(props).toEqual({
         siteName: 'Acme',
         version: 'v0.49.0',
         googleAuthClientId: null,
         passwordLoginEnabled: true,
       });
     });

     it('deleteSession calls DELETE /api/session', async () => {
       const del = jest.fn(async (_path: string) => undefined);
       const client = { del } as unknown as MetabaseClient;

       await expect(deleteSession(client)).resolves.toBeUndefined();
       expect(del).toHaveBeenCalledWith('/api/session');
     });
   });
   ```

2. Run it, expect FAIL:
   - Command: `npm test -- src/api/endpoints.test.ts`
   - Expected output contains: `Cannot find module './endpoints'`, run ends `Tests: ... failed`.

3. Implement. Create `src/api/endpoints.ts` with this exact content:
   ```ts
   import type { MetabaseClient } from './client';
   import {
     CurrentUserSchema,
     SessionPropertiesSchema,
     type CurrentUser,
     type SessionProperties,
   } from './schemas';

   /** GET /api/user/current — validates the active session and returns the user. */
   export function getCurrentUser(client: MetabaseClient): Promise<CurrentUser> {
     return client.get('/api/user/current', CurrentUserSchema);
   }

   /**
    * GET /api/session/properties using an authenticated client.
    * For the UNauthenticated capability-detection call used during setup, see
    * fetchSessionProperties in src/auth/session.ts.
    */
   export function getSessionProperties(client: MetabaseClient): Promise<SessionProperties> {
     return client.get('/api/session/properties', SessionPropertiesSchema);
   }

   /** DELETE /api/session — logout. */
   export function deleteSession(client: MetabaseClient): Promise<void> {
     return client.del('/api/session');
   }
   ```

4. Run, expect PASS:
   - Command: `npm test -- src/api/endpoints.test.ts`
   - Expected output contains: `Tests:       3 passed, 3 total`.

5. Typecheck and lint the whole section before final commit:
   - Command: `npm run typecheck && npm run lint`
   - Expected output: no TypeScript errors and no eslint errors (lint may print nothing on success, or `✔ No problems`).

6. Commit:
   ```sh
   git add src/api/endpoints.ts src/api/endpoints.test.ts
   git commit -m "feat(api): add typed endpoint helpers (getCurrentUser, getSessionProperties, deleteSession)"
   ```

---

### Task 14: Secure storage wrapper (`src/auth/secureStore.ts`)

Namespaced wrappers around `expo-secure-store`. Tokens use key `mb_token_${instanceId}`; credentials use key `mb_creds_${instanceId}` storing a JSON string `{"username":...,"password":...}`. This is the ONLY place auth secrets are written. All six functions per the contract.

**Files:**
- Create: `src/auth/secureStore.ts`
- Test: `src/auth/secureStore.test.ts`
- Modify: `jest.setup.ts` (add the `expo-secure-store` mock if not already present)

**Steps:**

1. **Add the `expo-secure-store` mock to `jest.setup.ts`.** Append (skip if an identical block already exists from a scaffold task):

   ```ts
   // jest.setup.ts
   jest.mock('expo-secure-store', () => {
     const store: Record<string, string> = {};
     return {
       __store: store,
       setItemAsync: jest.fn(async (key: string, value: string) => {
         store[key] = value;
       }),
       getItemAsync: jest.fn(async (key: string) => (key in store ? store[key] : null)),
       deleteItemAsync: jest.fn(async (key: string) => {
         delete store[key];
       }),
     };
   });
   ```

   Confirm `jest.config.js` has `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']` (set by the test-infra scaffold task). If it does not, add it.

2. **Write the failing test** at `src/auth/secureStore.test.ts`:

   ```ts
   import * as SecureStore from 'expo-secure-store';
   import {
     saveToken,
     getToken,
     deleteToken,
     saveCredentials,
     getCredentials,
     deleteCredentials,
   } from './secureStore';

   const setItem = SecureStore.setItemAsync as jest.Mock;
   const getItem = SecureStore.getItemAsync as jest.Mock;
   const deleteItem = SecureStore.deleteItemAsync as jest.Mock;

   beforeEach(() => {
     // reset the fake backing store between tests
     const store = (SecureStore as unknown as { __store: Record<string, string> }).__store;
     for (const k of Object.keys(store)) delete store[k];
     setItem.mockClear();
     getItem.mockClear();
     deleteItem.mockClear();
   });

   describe('token storage', () => {
     it('saves the token under the namespaced key', async () => {
       await saveToken('inst-1', 'tok-abc');
       expect(setItem).toHaveBeenCalledWith('mb_token_inst-1', 'tok-abc');
     });

     it('round-trips the token', async () => {
       await saveToken('inst-1', 'tok-abc');
       await expect(getToken('inst-1')).resolves.toBe('tok-abc');
     });

     it('returns null when no token is stored', async () => {
       await expect(getToken('missing')).resolves.toBeNull();
     });

     it('deletes the token under the namespaced key', async () => {
       await saveToken('inst-1', 'tok-abc');
       await deleteToken('inst-1');
       expect(deleteItem).toHaveBeenCalledWith('mb_token_inst-1');
       await expect(getToken('inst-1')).resolves.toBeNull();
     });

     it('isolates tokens by instance id', async () => {
       await saveToken('inst-1', 'a');
       await saveToken('inst-2', 'b');
       await expect(getToken('inst-1')).resolves.toBe('a');
       await expect(getToken('inst-2')).resolves.toBe('b');
     });
   });

   describe('credentials storage', () => {
     it('saves credentials as JSON under the namespaced key', async () => {
       await saveCredentials('inst-1', 'me@example.com', 'pw');
       expect(setItem).toHaveBeenCalledWith(
         'mb_creds_inst-1',
         JSON.stringify({ username: 'me@example.com', password: 'pw' }),
       );
     });

     it('round-trips credentials', async () => {
       await saveCredentials('inst-1', 'me@example.com', 'pw');
       await expect(getCredentials('inst-1')).resolves.toEqual({
         username: 'me@example.com',
         password: 'pw',
       });
     });

     it('returns null when no credentials are stored', async () => {
       await expect(getCredentials('missing')).resolves.toBeNull();
     });

     it('returns null (not a throw) when stored JSON is corrupt', async () => {
       await SecureStore.setItemAsync('mb_creds_inst-1', 'not-json{');
       await expect(getCredentials('inst-1')).resolves.toBeNull();
     });

     it('deletes credentials under the namespaced key', async () => {
       await saveCredentials('inst-1', 'me@example.com', 'pw');
       await deleteCredentials('inst-1');
       expect(deleteItem).toHaveBeenCalledWith('mb_creds_inst-1');
       await expect(getCredentials('inst-1')).resolves.toBeNull();
     });
   });
   ```

3. **Run it, expect FAIL.** Command:

   ```
   npm test -- src/auth/secureStore.test.ts
   ```

   Expected: the suite fails to even load / run because `./secureStore` does not exist yet, e.g.:

   ```
   FAIL  src/auth/secureStore.test.ts
     ● Test suite failed to run
       Cannot find module './secureStore' from 'src/auth/secureStore.test.ts'
   Tests:       0 total
   ```

4. **Implement** `src/auth/secureStore.ts`:

   ```ts
   import * as SecureStore from 'expo-secure-store';

   const tokenKey = (instanceId: string): string => `mb_token_${instanceId}`;
   const credsKey = (instanceId: string): string => `mb_creds_${instanceId}`;

   export async function saveToken(instanceId: string, token: string): Promise<void> {
     await SecureStore.setItemAsync(tokenKey(instanceId), token);
   }

   export async function getToken(instanceId: string): Promise<string | null> {
     return SecureStore.getItemAsync(tokenKey(instanceId));
   }

   export async function deleteToken(instanceId: string): Promise<void> {
     await SecureStore.deleteItemAsync(tokenKey(instanceId));
   }

   export async function saveCredentials(
     instanceId: string,
     username: string,
     password: string,
   ): Promise<void> {
     await SecureStore.setItemAsync(credsKey(instanceId), JSON.stringify({ username, password }));
   }

   export async function getCredentials(
     instanceId: string,
   ): Promise<{ username: string; password: string } | null> {
     const raw = await SecureStore.getItemAsync(credsKey(instanceId));
     if (raw == null) return null;
     try {
       const parsed = JSON.parse(raw) as unknown;
       if (
         typeof parsed === 'object' &&
         parsed !== null &&
         typeof (parsed as { username?: unknown }).username === 'string' &&
         typeof (parsed as { password?: unknown }).password === 'string'
       ) {
         const { username, password } = parsed as { username: string; password: string };
         return { username, password };
       }
       return null;
     } catch {
       // Corrupt/non-JSON value: treat as absent rather than throwing.
       return null;
     }
   }

   export async function deleteCredentials(instanceId: string): Promise<void> {
     await SecureStore.deleteItemAsync(credsKey(instanceId));
   }
   ```

5. **Run, expect PASS.** Command:

   ```
   npm test -- src/auth/secureStore.test.ts
   ```

   Expected tail:

   ```
   Tests:       11 passed, 11 total
   ```

6. **Commit.**

   ```
   git add src/auth/secureStore.ts src/auth/secureStore.test.ts jest.setup.ts jest.config.js
   git commit -m "feat(auth): namespaced secure-store wrapper for tokens and credentials"
   ```

---

### Task 15: Instances store (`src/store/instances.ts`)

A zustand store of saved Metabase instances + the active instance id, persisted to AsyncStorage (non-sensitive). Tokens are NEVER stored here — only `Instance` metadata (id, baseUrl, siteName, version). Removing the active instance clears `activeInstanceId`.

**Files:**
- Create: `src/store/persistStorage.ts` (a tiny zustand `StateStorage` adapter over AsyncStorage, so it is mockable in one place)
- Create: `src/store/instances.ts`
- Test: `src/store/instances.test.ts`
- Modify: `jest.setup.ts` (add the AsyncStorage mock)

**Steps:**

1. **Install AsyncStorage** (zustand `persist` needs a storage backend; AsyncStorage is the Expo-supported non-sensitive store):

   ```
   npx expo install @react-native-async-storage/async-storage
   ```

2. **Add the AsyncStorage mock to `jest.setup.ts`.** AsyncStorage ships an official jest mock; register it:

   ```ts
   // jest.setup.ts
   jest.mock('@react-native-async-storage/async-storage', () =>
     require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
   );
   ```

3. **Create the persistence adapter** `src/store/persistStorage.ts` (single mockable seam; converts AsyncStorage into zustand's `StateStorage`):

   ```ts
   import AsyncStorage from '@react-native-async-storage/async-storage';
   import type { StateStorage } from 'zustand/middleware';

   /**
    * Non-sensitive persistence for zustand stores. Backed by AsyncStorage.
    * Auth secrets (session tokens, remembered credentials) must NEVER be written
    * here — those belong only in src/auth/secureStore.ts.
    */
   export const asyncStorageAdapter: StateStorage = {
     getItem: (name) => AsyncStorage.getItem(name),
     setItem: (name, value) => AsyncStorage.setItem(name, value),
     removeItem: (name) => AsyncStorage.removeItem(name),
   };
   ```

4. **Write the failing test** at `src/store/instances.test.ts`. Persistence is async/fire-and-forget, so tests drive the store synchronously via `getState()` and reset between tests:

   ```ts
   import { useInstancesStore } from './instances';
   import type { Instance } from '../auth/types';

   const inst = (id: string): Instance => ({
     id,
     baseUrl: `https://${id}.example.com`,
     siteName: `Site ${id}`,
     version: 'v0.48.0',
   });

   beforeEach(() => {
     useInstancesStore.setState({ instances: [], activeInstanceId: null });
   });

   describe('useInstancesStore', () => {
     it('starts empty with no active instance', () => {
       const s = useInstancesStore.getState();
       expect(s.instances).toEqual([]);
       expect(s.activeInstanceId).toBeNull();
     });

     it('addInstance appends an instance', () => {
       useInstancesStore.getState().addInstance(inst('a'));
       expect(useInstancesStore.getState().instances).toEqual([inst('a')]);
     });

     it('addInstance replaces an existing instance with the same id', () => {
       useInstancesStore.getState().addInstance(inst('a'));
       useInstancesStore.getState().addInstance({ ...inst('a'), siteName: 'Renamed' });
       const { instances } = useInstancesStore.getState();
       expect(instances).toHaveLength(1);
       expect(instances[0].siteName).toBe('Renamed');
     });

     it('setActiveInstance sets the active id', () => {
       useInstancesStore.getState().addInstance(inst('a'));
       useInstancesStore.getState().setActiveInstance('a');
       expect(useInstancesStore.getState().activeInstanceId).toBe('a');
     });

     it('setActiveInstance(null) clears the active id', () => {
       useInstancesStore.getState().setActiveInstance('a');
       useInstancesStore.getState().setActiveInstance(null);
       expect(useInstancesStore.getState().activeInstanceId).toBeNull();
     });

     it('removeInstance removes by id', () => {
       useInstancesStore.getState().addInstance(inst('a'));
       useInstancesStore.getState().addInstance(inst('b'));
       useInstancesStore.getState().removeInstance('a');
       expect(useInstancesStore.getState().instances.map((i) => i.id)).toEqual(['b']);
     });

     it('removeInstance clears active id when the removed instance was active', () => {
       useInstancesStore.getState().addInstance(inst('a'));
       useInstancesStore.getState().setActiveInstance('a');
       useInstancesStore.getState().removeInstance('a');
       expect(useInstancesStore.getState().activeInstanceId).toBeNull();
     });

     it('removeInstance leaves active id untouched when a different instance was active', () => {
       useInstancesStore.getState().addInstance(inst('a'));
       useInstancesStore.getState().addInstance(inst('b'));
       useInstancesStore.getState().setActiveInstance('b');
       useInstancesStore.getState().removeInstance('a');
       expect(useInstancesStore.getState().activeInstanceId).toBe('b');
     });
   });
   ```

5. **Run it, expect FAIL.** Command:

   ```
   npm test -- src/store/instances.test.ts
   ```

   Expected:

   ```
   FAIL  src/store/instances.test.ts
     ● Test suite failed to run
       Cannot find module './instances' from 'src/store/instances.test.ts'
   ```

6. **Implement** `src/store/instances.ts`:

   ```ts
   import { create } from 'zustand';
   import { persist, createJSONStorage } from 'zustand/middleware';
   import type { Instance } from '../auth/types';
   import { asyncStorageAdapter } from './persistStorage';

   export interface InstancesState {
     instances: Instance[];
     activeInstanceId: string | null;
     addInstance: (instance: Instance) => void;
     setActiveInstance: (id: string | null) => void;
     removeInstance: (id: string) => void;
   }

   export const useInstancesStore = create<InstancesState>()(
     persist(
       (set) => ({
         instances: [],
         activeInstanceId: null,
         addInstance: (instance) =>
           set((state) => ({
             instances: [
               ...state.instances.filter((i) => i.id !== instance.id),
               instance,
             ],
           })),
         setActiveInstance: (id) => set({ activeInstanceId: id }),
         removeInstance: (id) =>
           set((state) => ({
             instances: state.instances.filter((i) => i.id !== id),
             activeInstanceId:
               state.activeInstanceId === id ? null : state.activeInstanceId,
           })),
       }),
       {
         name: 'mb-instances',
         storage: createJSONStorage(() => asyncStorageAdapter),
         // Persist only data, never functions. (Tokens are NOT in this store at all.)
         partialize: (state) => ({
           instances: state.instances,
           activeInstanceId: state.activeInstanceId,
         }),
       },
     ),
   );
   ```

   Note for the merge step: the contract types `useInstancesStore` as `UseBoundStore<any>`; the concrete `create<InstancesState>()` return is assignable to that. No cast needed.

7. **Run, expect PASS.** Command:

   ```
   npm test -- src/store/instances.test.ts
   ```

   Expected tail:

   ```
   Tests:       8 passed, 8 total
   ```

8. **Commit.**

   ```
   git add src/store/instances.ts src/store/persistStorage.ts src/store/instances.test.ts jest.setup.ts package.json
   git commit -m "feat(store): persisted instances store (non-sensitive, tokens excluded)"
   ```

---

### Task 16: Preferences store (`src/store/preferences.ts`)

A zustand store for UI preferences — theme mode, locale, and the "remember credentials" toggle — persisted via the same AsyncStorage adapter. Defaults: `themeMode: 'system'`, `locale: 'system'`, `rememberCredentials: false`.

**Files:**
- Create: `src/store/preferences.ts`
- Test: `src/store/preferences.test.ts`

(Depends on `src/store/persistStorage.ts` and the AsyncStorage mock from Task 15.)

**Steps:**

1. **Write the failing test** at `src/store/preferences.test.ts`:

   ```ts
   import { usePreferencesStore } from './preferences';

   beforeEach(() => {
     usePreferencesStore.setState({
       themeMode: 'system',
       locale: 'system',
       rememberCredentials: false,
     });
   });

   describe('usePreferencesStore', () => {
     it('has sensible defaults', () => {
       const s = usePreferencesStore.getState();
       expect(s.themeMode).toBe('system');
       expect(s.locale).toBe('system');
       expect(s.rememberCredentials).toBe(false);
     });

     it('setThemeMode updates the theme mode', () => {
       usePreferencesStore.getState().setThemeMode('dark');
       expect(usePreferencesStore.getState().themeMode).toBe('dark');
       usePreferencesStore.getState().setThemeMode('light');
       expect(usePreferencesStore.getState().themeMode).toBe('light');
     });

     it('setLocale updates the locale', () => {
       usePreferencesStore.getState().setLocale('zh');
       expect(usePreferencesStore.getState().locale).toBe('zh');
       usePreferencesStore.getState().setLocale('en');
       expect(usePreferencesStore.getState().locale).toBe('en');
     });

     it('setRememberCredentials toggles the flag', () => {
       usePreferencesStore.getState().setRememberCredentials(true);
       expect(usePreferencesStore.getState().rememberCredentials).toBe(true);
       usePreferencesStore.getState().setRememberCredentials(false);
       expect(usePreferencesStore.getState().rememberCredentials).toBe(false);
     });
   });
   ```

2. **Run it, expect FAIL.** Command:

   ```
   npm test -- src/store/preferences.test.ts
   ```

   Expected:

   ```
   FAIL  src/store/preferences.test.ts
     ● Test suite failed to run
       Cannot find module './preferences' from 'src/store/preferences.test.ts'
   ```

3. **Implement** `src/store/preferences.ts`:

   ```ts
   import { create } from 'zustand';
   import { persist, createJSONStorage } from 'zustand/middleware';
   import { asyncStorageAdapter } from './persistStorage';

   export interface PreferencesState {
     themeMode: 'system' | 'light' | 'dark';
     locale: 'system' | 'en' | 'zh';
     rememberCredentials: boolean;
     setThemeMode: (m: PreferencesState['themeMode']) => void;
     setLocale: (l: PreferencesState['locale']) => void;
     setRememberCredentials: (v: boolean) => void;
   }

   export const usePreferencesStore = create<PreferencesState>()(
     persist(
       (set) => ({
         themeMode: 'system',
         locale: 'system',
         rememberCredentials: false,
         setThemeMode: (themeMode) => set({ themeMode }),
         setLocale: (locale) => set({ locale }),
         setRememberCredentials: (rememberCredentials) => set({ rememberCredentials }),
       }),
       {
         name: 'mb-preferences',
         storage: createJSONStorage(() => asyncStorageAdapter),
         partialize: (state) => ({
           themeMode: state.themeMode,
           locale: state.locale,
           rememberCredentials: state.rememberCredentials,
         }),
       },
     ),
   );
   ```

4. **Run, expect PASS.** Command:

   ```
   npm test -- src/store/preferences.test.ts
   ```

   Expected tail:

   ```
   Tests:       4 passed, 4 total
   ```

5. **Commit.**

   ```
   git add src/store/preferences.ts src/store/preferences.test.ts
   git commit -m "feat(store): persisted preferences store (theme, locale, remember-credentials)"
   ```

---

### Task 17: Session lifecycle (`src/auth/session.ts`)

The auth domain's session functions. `fetchSessionProperties` and `loginWithPassword` are pre-token operations that build a **tokenless** `MetabaseClient` (the contract's `getToken` returns `null`). `fetchCurrentUser` and `logout` take an already-built authenticated client. All HTTP goes through `MetabaseClient`, so error mapping is exercised end-to-end and asserted with MSW.

**Files:**
- Create: `src/auth/session.ts`
- Test: `src/auth/session.test.ts`
- Modify: `jest.setup.ts` (ensure MSW lifecycle hooks are registered — add if the api-client task hasn't already)

This depends on `src/api/client.ts`, `src/api/schemas.ts`, and `src/api/errors.ts` (other sections). It uses, verbatim from the contract: `MetabaseClient`, `MetabaseClientOptions`, `SessionPropertiesSchema`/`SessionProperties`, `CurrentUser`/`CurrentUserSchema`, `SessionToken`/`SessionTokenSchema`, and `ApiException`/`ApiError`.

**Steps:**

1. **Install MSW (node) if not already present** (dev tool):

   ```
   npm i -D msw
   ```

2. **Add MSW global lifecycle to `jest.setup.ts`** (skip if the api-client task already added an identical block — there must be exactly one `server` instance shared via a fixtures module; here we create it in the test file to keep this task self-contained). Ensure `jest.setup.ts` does NOT also stub `fetch`; jest-expo with whatwg-fetch provides a real `fetch` that MSW/node can intercept. If your environment lacks a global `fetch`, add at the top of `jest.setup.ts`:

   ```ts
   // jest.setup.ts — ensure a real fetch exists for MSW node interception
   import 'whatwg-fetch';
   ```

3. **Write the failing test** at `src/auth/session.test.ts`:

   ```ts
   import { http, HttpResponse } from 'msw';
   import { setupServer } from 'msw/node';
   import {
     fetchSessionProperties,
     loginWithPassword,
     fetchCurrentUser,
     logout,
   } from './session';
   import { MetabaseClient } from '../api/client';
   import { ApiException } from '../api/errors';

   const BASE = 'https://demo.metabase.test';
   const server = setupServer();

   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
   afterEach(() => server.resetHandlers());
   afterAll(() => server.close());

   const authedClient = (token = 'tok-1') =>
     new MetabaseClient({ baseUrl: BASE, getToken: () => token });

   describe('fetchSessionProperties', () => {
     it('parses raw kebab-case settings into SessionProperties', async () => {
       server.use(
         http.get(`${BASE}/api/session/properties`, () =>
           HttpResponse.json({
             'site-name': 'Acme Analytics',
             version: { tag: 'v0.48.6' },
             'google-auth-client-id': 'gclient.apps.googleusercontent.com',
             'enable-password-login': true,
             'google-auth-enabled': true,
           }),
         ),
       );

       await expect(fetchSessionProperties(BASE)).resolves.toEqual({
         siteName: 'Acme Analytics',
         version: 'v0.48.6',
         googleAuthClientId: 'gclient.apps.googleusercontent.com',
         passwordLoginEnabled: true,
       });
     });

     it('defaults passwordLoginEnabled to true and googleAuthClientId to null when absent', async () => {
       server.use(
         http.get(`${BASE}/api/session/properties`, () =>
           HttpResponse.json({
             'site-name': 'Minimal',
             version: { tag: 'v0.48.0' },
           }),
         ),
       );

       const props = await fetchSessionProperties(BASE);
       expect(props.passwordLoginEnabled).toBe(true);
       expect(props.googleAuthClientId).toBeNull();
     });

     it('maps a 500 to a server ApiException', async () => {
       server.use(
         http.get(`${BASE}/api/session/properties`, () =>
           HttpResponse.json({ message: 'boom' }, { status: 500 }),
         ),
       );

       await expect(fetchSessionProperties(BASE)).rejects.toMatchObject({
         error: { kind: 'server', status: 500 },
       });
       await expect(fetchSessionProperties(BASE)).rejects.toBeInstanceOf(ApiException);
     });
   });

   describe('loginWithPassword', () => {
     it('posts credentials and returns the session token id', async () => {
       server.use(
         http.post(`${BASE}/api/session`, async ({ request }) => {
           const body = (await request.json()) as { username: string; password: string };
           expect(body).toEqual({ username: 'me@acme.test', password: 'hunter2' });
           return HttpResponse.json({ id: 'sess-uuid-123' });
         }),
       );

       await expect(
         loginWithPassword(BASE, 'me@acme.test', 'hunter2'),
       ).resolves.toBe('sess-uuid-123');
     });

     it('maps bad credentials (401) to an unauthorized ApiException', async () => {
       server.use(
         http.post(`${BASE}/api/session`, () =>
           HttpResponse.json({ errors: { password: 'did not match' } }, { status: 401 }),
         ),
       );

       await expect(
         loginWithPassword(BASE, 'me@acme.test', 'wrong'),
       ).rejects.toMatchObject({ error: { kind: 'unauthorized' } });
     });
   });

   describe('fetchCurrentUser', () => {
     it('parses /api/user/current into camelCase CurrentUser', async () => {
       server.use(
         http.get(`${BASE}/api/user/current`, ({ request }) => {
           expect(request.headers.get('X-Metabase-Session')).toBe('tok-1');
           return HttpResponse.json({
             id: 7,
             email: 'me@acme.test',
             first_name: 'Me',
             last_name: null,
             is_superuser: true,
           });
         }),
       );

       await expect(fetchCurrentUser(authedClient())).resolves.toEqual({
         id: 7,
         email: 'me@acme.test',
         firstName: 'Me',
         lastName: null,
         isSuperuser: true,
       });
     });
   });

   describe('logout', () => {
     it('issues DELETE /api/session', async () => {
       let called = false;
       server.use(
         http.delete(`${BASE}/api/session`, () => {
           called = true;
           return new HttpResponse(null, { status: 204 });
         }),
       );

       await logout(authedClient());
       expect(called).toBe(true);
     });
   });
   ```

4. **Run it, expect FAIL.** Command:

   ```
   npm test -- src/auth/session.test.ts
   ```

   Expected:

   ```
   FAIL  src/auth/session.test.ts
     ● Test suite failed to run
       Cannot find module './session' from 'src/auth/session.test.ts'
   ```

5. **Implement** `src/auth/session.ts`:

   ```ts
   import { MetabaseClient } from '../api/client';
   import {
     SessionPropertiesSchema,
     CurrentUserSchema,
     SessionTokenSchema,
     type SessionProperties,
     type CurrentUser,
   } from '../api/schemas';

   /**
    * Build a tokenless client for pre-login calls. getToken returns null, so the
    * client sends no X-Metabase-Session header. baseUrl is assumed already
    * normalized by the caller (see src/lib/url.ts normalizeBaseUrl).
    */
   function tokenlessClient(baseUrl: string): MetabaseClient {
     return new MetabaseClient({ baseUrl, getToken: () => null });
   }

   /** Unauthenticated capability probe: GET /api/session/properties. */
   export async function fetchSessionProperties(baseUrl: string): Promise<SessionProperties> {
     return tokenlessClient(baseUrl).get('/api/session/properties', SessionPropertiesSchema);
   }

   /** POST /api/session { username, password } -> returns the session token id. */
   export async function loginWithPassword(
     baseUrl: string,
     username: string,
     password: string,
   ): Promise<string> {
     const token = await tokenlessClient(baseUrl).post(
       '/api/session',
       { username, password },
       SessionTokenSchema,
     );
     return token.id;
   }

   /** GET /api/user/current — used to validate a stored session on launch. */
   export async function fetchCurrentUser(client: MetabaseClient): Promise<CurrentUser> {
     return client.get('/api/user/current', CurrentUserSchema);
   }

   /** DELETE /api/session — server-side logout. Token wipe is the caller's job. */
   export async function logout(client: MetabaseClient): Promise<void> {
     await client.del('/api/session');
   }
   ```

   Integration note for the api/schemas author (other section): `SessionTokenSchema` must parse `{ id }` into `SessionToken`, `SessionPropertiesSchema` must map `site-name`/`version.tag`(or `.short`)/`google-auth-client-id`/`enable-password-login` (default `true`) per the contract, and `CurrentUserSchema` must map `first_name`/`last_name`/`is_superuser`. These names are used verbatim above; if the schemas export only the type and not the schema const, add the `*Schema` exports there.

6. **Run, expect PASS.** Command:

   ```
   npm test -- src/auth/session.test.ts
   ```

   Expected tail:

   ```
   Tests:       7 passed, 7 total
   ```

7. **Commit.**

   ```
   git add src/auth/session.ts src/auth/session.test.ts jest.setup.ts package.json
   git commit -m "feat(auth): session lifecycle (properties, password login, current user, logout)"
   ```

---

### Task 18: Google sign-in (`src/auth/googleAuth.ts`)

`loginWithGoogle(baseUrl, googleAuthClientId)` configures `@react-native-google-signin/google-signin` with `webClientId = googleAuthClientId`, obtains a Google **idToken**, exchanges it via `POST /api/session/google_auth { token: idToken }`, and returns the Metabase session token id. Cancellation throws a typed `GoogleAuthCancelledError`.

> Audience caveat (documented in code): Metabase verifies the idToken's `aud` against its configured Google client id. We set `webClientId` to that exact id so the resulting idToken's audience matches. Whether the native-SDK token is accepted by `/api/session/google_auth` must be validated against a live instance; if rejected, the UI falls back to password login (handled at the screen layer, not here).

**Files:**
- Create: `src/auth/googleAuth.ts`
- Test: `src/auth/googleAuth.test.ts`
- Modify: `jest.setup.ts` (add the google-signin mock)

This requires a dev build (config plugin), not Expo Go — relevant for runtime, not for these jest tests, which fully mock the module.

**Steps:**

1. **Install the library and its config plugin** (native dep — let Expo pick the version):

   ```
   npx expo install @react-native-google-signin/google-signin
   ```

   Add to `app.json` plugins (runtime requirement; no test impact):

   ```json
   { "plugins": ["@react-native-google-signin/google-signin"] }
   ```

2. **Add the google-signin mock to `jest.setup.ts`.** Mirror the real module surface used by the implementation (`GoogleSignin.configure`, `GoogleSignin.hasPlayServices`, `GoogleSignin.signIn`, `isSuccessResponse`, `isErrorWithCode`, `statusCodes`):

   ```ts
   // jest.setup.ts
   jest.mock('@react-native-google-signin/google-signin', () => {
     const statusCodes = {
       SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
       IN_PROGRESS: 'IN_PROGRESS',
       PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
     };
     return {
       statusCodes,
       GoogleSignin: {
         configure: jest.fn(),
         hasPlayServices: jest.fn(async () => true),
         signIn: jest.fn(),
       },
       // Real lib: isSuccessResponse(r) === (r.type === 'success')
       isSuccessResponse: (r: { type?: string }) => r?.type === 'success',
       // Real lib: true for errors carrying a `code` string.
       isErrorWithCode: (e: unknown): e is { code: string } =>
         typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string',
     };
   });
   ```

3. **Write the failing test** at `src/auth/googleAuth.test.ts`:

   ```ts
   import { http, HttpResponse } from 'msw';
   import { setupServer } from 'msw/node';
   import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
   import { loginWithGoogle, GoogleAuthCancelledError } from './googleAuth';

   const BASE = 'https://demo.metabase.test';
   const CLIENT_ID = 'gclient.apps.googleusercontent.com';
   const server = setupServer();

   const configure = GoogleSignin.configure as jest.Mock;
   const signIn = GoogleSignin.signIn as jest.Mock;
   const hasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;

   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
   afterEach(() => {
     server.resetHandlers();
     configure.mockClear();
     signIn.mockReset();
     hasPlayServices.mockClear();
   });
   afterAll(() => server.close());

   describe('loginWithGoogle', () => {
     it('configures webClientId, gets an idToken, exchanges it, and returns the session id', async () => {
       signIn.mockResolvedValue({ type: 'success', data: { idToken: 'g-id-token-xyz' } });
       server.use(
         http.post(`${BASE}/api/session/google_auth`, async ({ request }) => {
           const body = (await request.json()) as { token: string };
           expect(body).toEqual({ token: 'g-id-token-xyz' });
           return HttpResponse.json({ id: 'mb-session-789' });
         }),
       );

       await expect(loginWithGoogle(BASE, CLIENT_ID)).resolves.toBe('mb-session-789');
       expect(configure).toHaveBeenCalledWith(
         expect.objectContaining({ webClientId: CLIENT_ID }),
       );
     });

     it('throws GoogleAuthCancelledError when the user cancels', async () => {
       const err = Object.assign(new Error('cancelled'), {
         code: statusCodes.SIGN_IN_CANCELLED,
       });
       signIn.mockRejectedValue(err);

       await expect(loginWithGoogle(BASE, CLIENT_ID)).rejects.toBeInstanceOf(
         GoogleAuthCancelledError,
       );
     });

     it('throws when the response has no idToken', async () => {
       signIn.mockResolvedValue({ type: 'success', data: { idToken: null } });
       await expect(loginWithGoogle(BASE, CLIENT_ID)).rejects.toThrow(/idToken/i);
     });

     it('re-throws non-cancellation sign-in errors as-is', async () => {
       signIn.mockRejectedValue(Object.assign(new Error('play services'), {
         code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
       }));
       await expect(loginWithGoogle(BASE, CLIENT_ID)).rejects.toThrow('play services');
     });
   });
   ```

4. **Run it, expect FAIL.** Command:

   ```
   npm test -- src/auth/googleAuth.test.ts
   ```

   Expected:

   ```
   FAIL  src/auth/googleAuth.test.ts
     ● Test suite failed to run
       Cannot find module './googleAuth' from 'src/auth/googleAuth.test.ts'
   ```

5. **Implement** `src/auth/googleAuth.ts`:

   ```ts
   import {
     GoogleSignin,
     isSuccessResponse,
     isErrorWithCode,
     statusCodes,
   } from '@react-native-google-signin/google-signin';
   import { MetabaseClient } from '../api/client';
   import { SessionTokenSchema } from '../api/schemas';

   /** Thrown when the user dismisses the native Google sign-in sheet. */
   export class GoogleAuthCancelledError extends Error {
     constructor() {
       super('Google sign-in was cancelled');
       this.name = 'GoogleAuthCancelledError';
     }
   }

   /**
    * Native Google sign-in -> idToken -> POST /api/session/google_auth -> token id.
    *
    * AUDIENCE CAVEAT: Metabase validates the idToken's `aud` claim against its
    * configured Google client id. We pass that exact id as `webClientId` so the
    * Google SDK mints an idToken whose audience == googleAuthClientId. This is the
    * only way the exchange can succeed; an Android OAuth client id would produce a
    * token with the wrong audience. Acceptance by a given instance must still be
    * validated live (some configs reject native-SDK tokens) — on failure callers
    * should fall back to password login. See spec §4.2.
    */
   export async function loginWithGoogle(
     baseUrl: string,
     googleAuthClientId: string,
   ): Promise<string> {
     GoogleSignin.configure({ webClientId: googleAuthClientId });

     let idToken: string | null;
     try {
       await GoogleSignin.hasPlayServices();
       const response = await GoogleSignin.signIn();
       if (!isSuccessResponse(response)) {
         // type === 'cancelled' (user dismissed without picking an account)
         throw new GoogleAuthCancelledError();
       }
       idToken = response.data.idToken;
     } catch (e) {
       if (e instanceof GoogleAuthCancelledError) throw e;
       if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
         throw new GoogleAuthCancelledError();
       }
       throw e;
     }

     if (idToken == null || idToken === '') {
       throw new Error('Google sign-in returned no idToken (check webClientId / OAuth config)');
     }

     const client = new MetabaseClient({ baseUrl, getToken: () => null });
     const token = await client.post(
       '/api/session/google_auth',
       { token: idToken },
       SessionTokenSchema,
     );
     return token.id;
   }
   ```

6. **Run, expect PASS.** Command:

   ```
   npm test -- src/auth/googleAuth.test.ts
   ```

   Expected tail:

   ```
   Tests:       4 passed, 4 total
   ```

7. **Commit.**

   ```
   git add src/auth/googleAuth.ts src/auth/googleAuth.test.ts jest.setup.ts app.json package.json
   git commit -m "feat(auth): native Google sign-in to Metabase session exchange"
   ```

---

### Task 19: Biometrics (`src/auth/biometrics.ts`)

Thin wrapper over `expo-local-authentication`. `isBiometricAvailable()` is `hasHardwareAsync() && isEnrolledAsync()`. `authenticate(promptMessage)` calls `authenticateAsync({ promptMessage })` and returns its `.success`.

**Files:**
- Create: `src/auth/biometrics.ts`
- Test: `src/auth/biometrics.test.ts`
- Modify: `jest.setup.ts` (add the expo-local-authentication mock)

**Steps:**

1. **Install** (native dep):

   ```
   npx expo install expo-local-authentication
   ```

2. **Add the mock to `jest.setup.ts`:**

   ```ts
   // jest.setup.ts
   jest.mock('expo-local-authentication', () => ({
     hasHardwareAsync: jest.fn(),
     isEnrolledAsync: jest.fn(),
     authenticateAsync: jest.fn(),
   }));
   ```

3. **Write the failing test** at `src/auth/biometrics.test.ts`:

   ```ts
   import * as LocalAuthentication from 'expo-local-authentication';
   import { isBiometricAvailable, authenticate } from './biometrics';

   const hasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
   const isEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;
   const authAsync = LocalAuthentication.authenticateAsync as jest.Mock;

   beforeEach(() => {
     hasHardware.mockReset();
     isEnrolled.mockReset();
     authAsync.mockReset();
   });

   describe('isBiometricAvailable', () => {
     it('is true only when hardware exists AND a biometric is enrolled', async () => {
       hasHardware.mockResolvedValue(true);
       isEnrolled.mockResolvedValue(true);
       await expect(isBiometricAvailable()).resolves.toBe(true);
     });

     it('is false when no hardware', async () => {
       hasHardware.mockResolvedValue(false);
       isEnrolled.mockResolvedValue(true);
       await expect(isBiometricAvailable()).resolves.toBe(false);
     });

     it('is false when hardware present but nothing enrolled', async () => {
       hasHardware.mockResolvedValue(true);
       isEnrolled.mockResolvedValue(false);
       await expect(isBiometricAvailable()).resolves.toBe(false);
     });
   });

   describe('authenticate', () => {
     it('returns true on success and forwards the prompt message', async () => {
       authAsync.mockResolvedValue({ success: true });
       await expect(authenticate('Unlock Metabase Companion')).resolves.toBe(true);
       expect(authAsync).toHaveBeenCalledWith({ promptMessage: 'Unlock Metabase Companion' });
     });

     it('returns false when authentication fails or is cancelled', async () => {
       authAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
       await expect(authenticate('Unlock')).resolves.toBe(false);
     });
   });
   ```

4. **Run it, expect FAIL.** Command:

   ```
   npm test -- src/auth/biometrics.test.ts
   ```

   Expected:

   ```
   FAIL  src/auth/biometrics.test.ts
     ● Test suite failed to run
       Cannot find module './biometrics' from 'src/auth/biometrics.test.ts'
   ```

5. **Implement** `src/auth/biometrics.ts`:

   ```ts
   import * as LocalAuthentication from 'expo-local-authentication';

   /** True only when the device has biometric hardware AND a biometric is enrolled. */
   export async function isBiometricAvailable(): Promise<boolean> {
     const [hasHardware, isEnrolled] = await Promise.all([
       LocalAuthentication.hasHardwareAsync(),
       LocalAuthentication.isEnrolledAsync(),
     ]);
     return hasHardware && isEnrolled;
   }

   /** Prompts for biometric (with device-passcode fallback) and returns success. */
   export async function authenticate(promptMessage: string): Promise<boolean> {
     const result = await LocalAuthentication.authenticateAsync({ promptMessage });
     return result.success;
   }
   ```

6. **Run, expect PASS.** Command:

   ```
   npm test -- src/auth/biometrics.test.ts
   ```

   Expected tail:

   ```
   Tests:       5 passed, 5 total
   ```

7. **Run the full suite + typecheck to confirm the section integrates.** Commands:

   ```
   npm test
   npm run typecheck
   ```

   Expected: all auth/store suites green; `tsc` exits 0 with no output.

8. **Commit.**

   ```
   git add src/auth/biometrics.ts src/auth/biometrics.test.ts jest.setup.ts package.json
   git commit -m "feat(auth): biometric availability + unlock wrapper"
   ```

---

Integration notes for the merge step:
- This section depends on the api section exporting these **exact** names from `src/api/schemas.ts`: `SessionPropertiesSchema`, `SessionTokenSchema`, `CurrentUserSchema` (zod consts, not just inferred types) and on `src/api/client.ts` `MetabaseClient` + `src/api/errors.ts` `ApiException`/`ApiError` per the contract.
- `jest.setup.ts` accumulates mocks from several sections (`expo-secure-store`, `@react-native-async-storage/async-storage`, `@react-native-google-signin/google-signin`, `expo-local-authentication`, MSW lifecycle). Merge into one file; each `jest.mock(...)` block above is idempotent and can be deduped if another section added the same one.
- New deps introduced here: `@react-native-async-storage/async-storage`, `@react-native-google-signin/google-signin`, `expo-local-authentication` (all via `npx expo install`), and dev dep `msw` (shared with the api section).

Sources: [react-native-google-signin API reference](https://react-native-google-signin.github.io/docs/api), [react-native-google-signin error handling](https://react-native-google-signin.github.io/docs/errors), [@react-native-google-signin/google-signin on npm](https://www.npmjs.com/package/@react-native-google-signin/google-signin)

---

### Task 20: Design tokens — `src/ui/theme.ts`

**Files:**
- Create: `src/ui/theme.ts`
- Test: `src/ui/theme.test.ts`

Steps:

1. **Write the failing test.** Create `src/ui/theme.test.ts`:
   ```ts
   import { lightTheme, darkTheme } from './theme';

   describe('theme', () => {
     it('spacing(3) === 12', () => {
       expect(lightTheme.spacing(3)).toBe(12);
       expect(darkTheme.spacing(3)).toBe(12);
     });

     it('exposes both modes with required color keys', () => {
       expect(lightTheme.mode).toBe('light');
       expect(darkTheme.mode).toBe('dark');
       for (const t of [lightTheme, darkTheme]) {
         expect(t.colors).toEqual(
           expect.objectContaining({
             background: expect.any(String),
             surface: expect.any(String),
             text: expect.any(String),
             textMuted: expect.any(String),
             primary: expect.any(String),
             border: expect.any(String),
             danger: expect.any(String),
           }),
         );
       }
     });

     it('exposes radius scale', () => {
       expect(lightTheme.radius).toEqual({ sm: 6, md: 10, lg: 16 });
     });
   });
   ```

2. **Run it, expect FAIL.**
   ```bash
   npm test -- src/ui/theme.test.ts
   ```
   Expected output contains: `Cannot find module './theme'` (or `lightTheme is not a function`), suite **FAILS**.

3. **Implement.** Create `src/ui/theme.ts`:
   ```ts
   export interface Theme {
     mode: 'light' | 'dark';
     colors: {
       background: string;
       surface: string;
       text: string;
       textMuted: string;
       primary: string;
       border: string;
       danger: string;
     };
     spacing: (n: number) => number; // n * 4
     radius: { sm: number; md: number; lg: number };
   }

   const spacing = (n: number): number => n * 4;
   const radius = { sm: 6, md: 10, lg: 16 } as const;

   // Metabase brand blue (#509EE3) as primary; neutral grays tuned for WCAG AA body text.
   export const lightTheme: Theme = {
     mode: 'light',
     colors: {
       background: '#FFFFFF',
       surface: '#F7F9FB',
       text: '#1B1F26',
       textMuted: '#5A6472',
       primary: '#3B82C4',
       border: '#E2E7EE',
       danger: '#D14343',
     },
     spacing,
     radius,
   };

   export const darkTheme: Theme = {
     mode: 'dark',
     colors: {
       background: '#15191F',
       surface: '#1E242C',
       text: '#F2F4F7',
       textMuted: '#9AA4B2',
       primary: '#62A8E5',
       border: '#2C333D',
       danger: '#E5736E',
     },
     spacing,
     radius,
   };
   ```

4. **Run, expect PASS.**
   ```bash
   npm test -- src/ui/theme.test.ts
   ```
   Expected: `Tests: 3 passed, 3 total`.

5. **Commit.**
   ```bash
   git add src/ui/theme.ts src/ui/theme.test.ts && git commit -m "feat(ui): add light/dark theme tokens"
   ```

---

### Task 21: Theme context — `src/ui/ThemeProvider.tsx`

**Files:**
- Create: `src/ui/ThemeProvider.tsx`
- Test: `src/ui/ThemeProvider.test.tsx`

Prereq: `src/store/preferences.ts` exists (other section), exporting `usePreferencesStore`. The test mocks it, so this task does not depend on its real implementation.

Steps:

1. **Write the failing test.** Create `src/ui/ThemeProvider.test.tsx`:
   ```tsx
   import React from 'react';
   import { Text } from 'react-native';
   import { render, screen } from '@testing-library/react-native';

   const mockState = { themeMode: 'system' as 'system' | 'light' | 'dark' };
   jest.mock('../store/preferences', () => ({
     usePreferencesStore: (selector: (s: typeof mockState) => unknown) => selector(mockState),
   }));

   const mockColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light');
   jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
     __esModule: true,
     default: () => mockColorScheme(),
   }));

   import { ThemeProvider, useTheme } from './ThemeProvider';

   function Probe() {
     const theme = useTheme();
     return <Text testID="mode">{theme.mode}</Text>;
   }

   describe('ThemeProvider', () => {
     it('resolves dark when themeMode is dark regardless of system', () => {
       mockState.themeMode = 'dark';
       mockColorScheme.mockReturnValue('light');
       render(
         <ThemeProvider>
           <Probe />
         </ThemeProvider>,
       );
       expect(screen.getByTestId('mode')).toHaveTextContent('dark');
     });

     it('follows system when themeMode is system', () => {
       mockState.themeMode = 'system';
       mockColorScheme.mockReturnValue('dark');
       render(
         <ThemeProvider>
           <Probe />
         </ThemeProvider>,
       );
       expect(screen.getByTestId('mode')).toHaveTextContent('dark');
     });
   });
   ```

2. **Run it, expect FAIL.**
   ```bash
   npm test -- src/ui/ThemeProvider.test.tsx
   ```
   Expected: `Cannot find module './ThemeProvider'`, suite **FAILS**.

3. **Implement.** Create `src/ui/ThemeProvider.tsx`:
   ```tsx
   import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
   import { useColorScheme } from 'react-native';
   import { usePreferencesStore } from '../store/preferences';
   import { darkTheme, lightTheme, type Theme } from './theme';

   const ThemeContext = createContext<Theme>(lightTheme);

   export function ThemeProvider({ children }: { children: ReactNode }) {
     const themeMode = usePreferencesStore(
       (s: { themeMode: 'system' | 'light' | 'dark' }) => s.themeMode,
     );
     const systemScheme = useColorScheme();

     const theme = useMemo<Theme>(() => {
       const resolved =
         themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;
       return resolved === 'dark' ? darkTheme : lightTheme;
     }, [themeMode, systemScheme]);

     return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
   }

   export function useTheme(): Theme {
     return useContext(ThemeContext);
   }
   ```

4. **Run, expect PASS.**
   ```bash
   npm test -- src/ui/ThemeProvider.test.tsx
   ```
   Expected: `Tests: 2 passed, 2 total`.

5. **Commit.**
   ```bash
   git add src/ui/ThemeProvider.tsx src/ui/ThemeProvider.test.tsx && git commit -m "feat(ui): add ThemeProvider with system/manual resolution"
   ```

---

### Task 22: i18n setup — `src/ui/i18n.ts`

**Files:**
- Create: `src/ui/i18n.ts`
- Test: `src/ui/i18n.test.ts`

Steps:

1. **Install deps (if not already by other section; safe to re-run).**
   ```bash
   npx expo install expo-localization && npm i i18next react-i18next
   ```

2. **Add the jest mock for `expo-localization`.** In the repo's jest setup file `jest.setup.ts` (created by the foundation section; if absent, create it and ensure `jest.config` references it via `setupFilesAfterEnv`), append:
   ```ts
   jest.mock('expo-localization', () => ({
     getLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }],
   }));
   ```

3. **Write the failing test.** Create `src/ui/i18n.test.ts`:
   ```ts
   import i18n, { changeLanguage } from './i18n';

   describe('i18n', () => {
     it('login.title differs between en and zh', async () => {
       await changeLanguage('en');
       const en = i18n.t('login.title');
       await changeLanguage('zh');
       const zh = i18n.t('login.title');
       expect(en).toBe('Sign in');
       expect(zh).toBe('登录');
       expect(en).not.toBe(zh);
     });

     it('exposes setup, unlock and error namespaces', async () => {
       await changeLanguage('en');
       expect(i18n.t('setup.title')).toBe('Connect to Metabase');
       expect(i18n.t('unlock.title')).toBe('Unlock');
       expect(i18n.t('errors.unreachable')).toMatch(/reach/i);
     });
   });
   ```

4. **Run it, expect FAIL.**
   ```bash
   npm test -- src/ui/i18n.test.ts
   ```
   Expected: `Cannot find module './i18n'`, suite **FAILS**.

5. **Implement.** Create `src/ui/i18n.ts`:
   ```ts
   import i18n from 'i18next';
   import { initReactI18next } from 'react-i18next';
   import { getLocales } from 'expo-localization';

   export const resources = {
     en: {
       translation: {
         common: {
           cancel: 'Cancel',
           retry: 'Retry',
           save: 'Save',
           email: 'Email',
           password: 'Password',
         },
         setup: {
           title: 'Connect to Metabase',
           urlLabel: 'Instance URL',
           urlPlaceholder: 'https://metabase.example.com',
           connect: 'Connect',
           connecting: 'Connecting…',
         },
         login: {
           title: 'Sign in',
           signIn: 'Sign in',
           signingIn: 'Signing in…',
           google: 'Sign in with Google',
           rememberMe: 'Remember me',
         },
         unlock: {
           title: 'Unlock',
           prompt: 'Unlock Metabase Companion',
           retry: 'Try again',
           logout: 'Log out',
         },
         settings: {
           title: 'Settings',
           theme: 'Theme',
           language: 'Language',
           themeSystem: 'System',
           themeLight: 'Light',
           themeDark: 'Dark',
           langSystem: 'System',
           logout: 'Log out',
         },
         home: { signedInAs: 'Signed in as {{email}}' },
         errors: {
           invalidUrl: 'That URL doesn’t look right.',
           unreachable: 'Couldn’t reach that instance. Check the URL and your connection.',
           unauthorized: 'Wrong email or password.',
           generic: 'Something went wrong. Please try again.',
         },
       },
     },
     zh: {
       translation: {
         common: {
           cancel: '取消',
           retry: '重试',
           save: '保存',
           email: '邮箱',
           password: '密码',
         },
         setup: {
           title: '连接到 Metabase',
           urlLabel: '实例地址',
           urlPlaceholder: 'https://metabase.example.com',
           connect: '连接',
           connecting: '连接中…',
         },
         login: {
           title: '登录',
           signIn: '登录',
           signingIn: '登录中…',
           google: '使用 Google 登录',
           rememberMe: '记住我',
         },
         unlock: {
           title: '解锁',
           prompt: '解锁 Metabase Companion',
           retry: '重试',
           logout: '退出登录',
         },
         settings: {
           title: '设置',
           theme: '主题',
           language: '语言',
           themeSystem: '跟随系统',
           themeLight: '浅色',
           themeDark: '深色',
           langSystem: '跟随系统',
           logout: '退出登录',
         },
         home: { signedInAs: '已登录：{{email}}' },
         errors: {
           invalidUrl: '该地址格式不正确。',
           unreachable: '无法连接到该实例。请检查地址和网络连接。',
           unauthorized: '邮箱或密码错误。',
           generic: '出错了，请重试。',
         },
       },
     },
   } as const;

   function deviceLanguage(): 'en' | 'zh' {
     const code = getLocales()[0]?.languageCode ?? 'en';
     return code.startsWith('zh') ? 'zh' : 'en';
   }

   if (!i18n.isInitialized) {
     void i18n.use(initReactI18next).init({
       resources,
       lng: deviceLanguage(),
       fallbackLng: 'en',
       interpolation: { escapeValue: false },
       returnNull: false,
     });
   }

   /**
    * Apply a locale preference. 'system' resolves to the device language.
    */
   export function changeLanguage(locale: 'system' | 'en' | 'zh'): Promise<unknown> {
     const target = locale === 'system' ? deviceLanguage() : locale;
     return i18n.changeLanguage(target);
   }

   export default i18n;
   ```

6. **Run, expect PASS.**
   ```bash
   npm test -- src/ui/i18n.test.ts
   ```
   Expected: `Tests: 2 passed, 2 total`.

7. **Commit.**
   ```bash
   git add src/ui/i18n.ts src/ui/i18n.test.ts jest.setup.ts package.json && git commit -m "feat(ui): add i18next setup with en + zh bundles"
   ```

---

### Task 23: App providers — `src/ui/AppProviders.tsx`

**Files:**
- Create: `src/ui/AppProviders.tsx`
- Test: `src/ui/AppProviders.test.tsx`

This is composition glue but still gets one focused render test.

Steps:

1. **Ensure deps present (safe to re-run).**
   ```bash
   npx expo install react-native-gesture-handler && npm i @tanstack/react-query
   ```

2. **Write the failing test.** Create `src/ui/AppProviders.test.tsx`:
   ```tsx
   import React from 'react';
   import { Text } from 'react-native';
   import { render, screen } from '@testing-library/react-native';
   import { useQueryClient } from '@tanstack/react-query';

   jest.mock('../store/preferences', () => ({
     usePreferencesStore: (selector: (s: { themeMode: string }) => unknown) =>
       selector({ themeMode: 'light' }),
   }));

   import { AppProviders } from './AppProviders';
   import { useTheme } from './ThemeProvider';

   function Probe() {
     const client = useQueryClient(); // throws if no QueryClientProvider above
     const theme = useTheme();
     return <Text testID="probe">{`${!!client}:${theme.mode}`}</Text>;
   }

   describe('AppProviders', () => {
     it('provides query client and theme to descendants', () => {
       render(
         <AppProviders>
           <Probe />
         </AppProviders>,
       );
       expect(screen.getByTestId('probe')).toHaveTextContent('true:light');
     });
   });
   ```

3. **Run it, expect FAIL.**
   ```bash
   npm test -- src/ui/AppProviders.test.tsx
   ```
   Expected: `Cannot find module './AppProviders'`, suite **FAILS**.

4. **Implement.** Create `src/ui/AppProviders.tsx`:
   ```tsx
   import React, { useState, type ReactNode } from 'react';
   import { GestureHandlerRootView } from 'react-native-gesture-handler';
   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
   import { I18nextProvider } from 'react-i18next';
   import i18n from './i18n';
   import { ThemeProvider } from './ThemeProvider';

   function makeQueryClient(): QueryClient {
     return new QueryClient({
       defaultOptions: {
         queries: {
           staleTime: 30_000,
           retry: (failureCount, error) => {
             const status = (error as { error?: { kind?: string } })?.error?.kind;
             if (status === 'unauthorized' || status === 'forbidden' || status === 'notFound') {
               return false;
             }
             return failureCount < 2;
           },
         },
       },
     });
   }

   export function AppProviders({ children }: { children: ReactNode }) {
     const [queryClient] = useState(makeQueryClient);
     return (
       <GestureHandlerRootView style={{ flex: 1 }}>
         <QueryClientProvider client={queryClient}>
           <I18nextProvider i18n={i18n}>
             <ThemeProvider>{children}</ThemeProvider>
           </I18nextProvider>
         </QueryClientProvider>
       </GestureHandlerRootView>
     );
   }
   ```

5. **Run, expect PASS.**
   ```bash
   npm test -- src/ui/AppProviders.test.tsx
   ```
   Expected: `Tests: 1 passed, 1 total`.

6. **Commit.**
   ```bash
   git add src/ui/AppProviders.tsx src/ui/AppProviders.test.tsx package.json && git commit -m "feat(ui): add AppProviders composing query/theme/i18n/gesture-handler"
   ```

---

### Task 24: Auth-gate hook + root layout — `src/auth/useAuthGate.ts` and `app/_layout.tsx`

**Files:**
- Create: `src/auth/useAuthGate.ts`
- Create: `app/_layout.tsx`
- Test: `src/auth/useAuthGate.test.ts`

The pure decision function is TDD'd; the layout is thin wiring around it.

Steps:

1. **Write the failing test.** Create `src/auth/useAuthGate.test.ts`:
   ```ts
   import { decideRoute } from './useAuthGate';

   describe('decideRoute', () => {
     it('no instance -> /setup', () => {
       expect(decideRoute({ hasInstance: false, hasToken: false, biometricRequired: false })).toBe(
         '/setup',
       );
       expect(decideRoute({ hasInstance: false, hasToken: true, biometricRequired: true })).toBe(
         '/setup',
       );
     });

     it('instance but no token -> /login', () => {
       expect(decideRoute({ hasInstance: true, hasToken: false, biometricRequired: false })).toBe(
         '/login',
       );
       expect(decideRoute({ hasInstance: true, hasToken: false, biometricRequired: true })).toBe(
         '/login',
       );
     });

     it('instance + token + biometric required -> /unlock', () => {
       expect(decideRoute({ hasInstance: true, hasToken: true, biometricRequired: true })).toBe(
         '/unlock',
       );
     });

     it('instance + token + no biometric -> /(tabs)', () => {
       expect(decideRoute({ hasInstance: true, hasToken: true, biometricRequired: false })).toBe(
         '/(tabs)',
       );
     });
   });
   ```

2. **Run it, expect FAIL.**
   ```bash
   npm test -- src/auth/useAuthGate.test.ts
   ```
   Expected: `Cannot find module './useAuthGate'`, suite **FAILS**.

3. **Implement the hook + decision function.** Create `src/auth/useAuthGate.ts`:
   ```ts
   export type GateRoute = '/setup' | '/login' | '/unlock' | '/(tabs)';

   export interface GateInput {
     hasInstance: boolean;
     hasToken: boolean;
     biometricRequired: boolean;
   }

   /**
    * Pure routing decision. Order matters: no instance < no token < needs unlock < ready.
    */
   export function decideRoute(input: GateInput): GateRoute {
     if (!input.hasInstance) return '/setup';
     if (!input.hasToken) return '/login';
     if (input.biometricRequired) return '/unlock';
     return '/(tabs)';
   }
   ```

4. **Run, expect PASS.**
   ```bash
   npm test -- src/auth/useAuthGate.test.ts
   ```
   Expected: `Tests: 4 passed, 4 total`.

5. **Add the stateful hook wrapper** below `decideRoute` in the same file (no separate test; it is thin glue over the tested function and the secure store):
   ```ts
   import { useEffect, useState } from 'react';
   import { useInstancesStore } from '../store/instances';
   import { usePreferencesStore } from '../store/preferences';
   import { getToken } from './secureStore';
   import { isBiometricAvailable } from './biometrics';

   export interface AuthGate {
     ready: boolean;
     route: GateRoute;
     /** Call after a successful biometric unlock to dismiss the /unlock gate for this session. */
     markUnlocked: () => void;
   }

   export function useAuthGate(): AuthGate {
     const activeInstanceId = useInstancesStore(
       (s: { activeInstanceId: string | null }) => s.activeInstanceId,
     );
     const rememberCredentials = usePreferencesStore(
       (s: { rememberCredentials: boolean }) => s.rememberCredentials,
     );
     const [ready, setReady] = useState(false);
     const [hasToken, setHasToken] = useState(false);
     const [biometricRequired, setBiometricRequired] = useState(false);
     const [unlockedThisSession, setUnlockedThisSession] = useState(false);

     useEffect(() => {
       let cancelled = false;
       async function resolve() {
         setReady(false);
         if (!activeInstanceId) {
           if (!cancelled) {
             setHasToken(false);
             setBiometricRequired(false);
             setReady(true);
           }
           return;
         }
         const token = await getToken(activeInstanceId);
         const biometric = token ? await isBiometricAvailable() : false;
         if (cancelled) return;
         setHasToken(!!token);
         setBiometricRequired(!!token && biometric && rememberCredentials && !unlockedThisSession);
         setReady(true);
       }
       void resolve();
       return () => {
         cancelled = true;
       };
     }, [activeInstanceId, rememberCredentials, unlockedThisSession]);

     return {
       ready,
       route: decideRoute({
         hasInstance: !!activeInstanceId,
         hasToken,
         biometricRequired,
       }),
       markUnlocked: () => setUnlockedThisSession(true),
     };
   }
   ```
   Run typecheck to confirm the additions compile:
   ```bash
   npm run typecheck
   ```
   Expected: no errors (exit 0).

6. **Implement the root layout.** Create `app/_layout.tsx`:
   ```tsx
   import React, { useEffect } from 'react';
   import { ActivityIndicator, View } from 'react-native';
   import { Stack, useRouter, useSegments } from 'expo-router';
   import { AppProviders } from '../src/ui/AppProviders';
   import { useAuthGate } from '../src/auth/useAuthGate';

   function Gate() {
     const { ready, route } = useAuthGate();
     const router = useRouter();
     const segments = useSegments();

     useEffect(() => {
       if (!ready) return;
       const current = `/${segments.join('/')}`;
       const target = route;
       // Avoid redundant navigation when already on (or under) the target group.
       const onTarget =
         target === '/(tabs)' ? segments[0] === '(tabs)' : current === target;
       if (!onTarget) {
         router.replace(target);
       }
     }, [ready, route, segments, router]);

     if (!ready) {
       return (
         <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
           <ActivityIndicator />
         </View>
       );
     }

     return (
       <Stack screenOptions={{ headerShown: false }}>
         <Stack.Screen name="(tabs)" />
         <Stack.Screen name="setup" />
         <Stack.Screen name="login" />
         <Stack.Screen name="unlock" />
       </Stack>
     );
   }

   export default function RootLayout() {
     return (
       <AppProviders>
         <Gate />
       </AppProviders>
     );
   }
   ```

7. **Typecheck the layout.**
   ```bash
   npm run typecheck
   ```
   Expected: no errors (exit 0).

8. **Commit.**
   ```bash
   git add src/auth/useAuthGate.ts src/auth/useAuthGate.test.ts app/_layout.tsx && git commit -m "feat(app): add auth gate hook and root layout routing"
   ```

---

### Task 25: Setup screen — `app/setup.tsx`

**Files:**
- Create: `app/setup.tsx`
- Test: `app/setup.test.tsx`

Depends on (other sections): `src/lib/url.ts` (`normalizeBaseUrl`), `src/auth/session.ts` (`fetchSessionProperties`), `src/store/instances.ts`. The test mocks `session`, `url`, the store, and `expo-router`.

Steps:

1. **Write the failing test.** Create `app/setup.test.tsx`:
   ```tsx
   import React from 'react';
   import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

   const mockReplace = jest.fn();
   jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

   jest.mock('../src/lib/url', () => ({
     normalizeBaseUrl: (s: string) => `https://${s.replace(/^https?:\/\//, '').replace(/\/$/, '')}`,
   }));

   const fetchSessionProperties = jest.fn();
   jest.mock('../src/auth/session', () => ({
     fetchSessionProperties: (...args: unknown[]) => fetchSessionProperties(...args),
   }));

   const addInstance = jest.fn();
   const setActiveInstance = jest.fn();
   jest.mock('../src/store/instances', () => ({
     useInstancesStore: (selector: (s: unknown) => unknown) =>
       selector({ addInstance, setActiveInstance }),
   }));

   // ThemeProvider context default is fine; no wrapper needed.
   jest.mock('../src/store/preferences', () => ({
     usePreferencesStore: (selector: (s: { themeMode: string }) => unknown) =>
       selector({ themeMode: 'light' }),
   }));

   import SetupScreen from './setup';

   describe('SetupScreen', () => {
     beforeEach(() => jest.clearAllMocks());

     it('connects, stores the instance, and navigates to /login', async () => {
       fetchSessionProperties.mockResolvedValue({
         siteName: 'Acme BI',
         version: 'v0.49.1',
         googleAuthClientId: null,
         passwordLoginEnabled: true,
       });

       render(<SetupScreen />);
       fireEvent.changeText(screen.getByTestId('setup-url'), 'metabase.acme.com');
       fireEvent.press(screen.getByTestId('setup-connect'));

       await waitFor(() => {
         expect(fetchSessionProperties).toHaveBeenCalledWith('https://metabase.acme.com');
       });
       expect(addInstance).toHaveBeenCalledWith(
         expect.objectContaining({
           baseUrl: 'https://metabase.acme.com',
           siteName: 'Acme BI',
           version: 'v0.49.1',
         }),
       );
       expect(setActiveInstance).toHaveBeenCalledWith(expect.any(String));
       expect(mockReplace).toHaveBeenCalledWith('/login');
     });

     it('shows an error when the instance is unreachable', async () => {
       fetchSessionProperties.mockRejectedValue(new Error('network'));
       render(<SetupScreen />);
       fireEvent.changeText(screen.getByTestId('setup-url'), 'down.example.com');
       fireEvent.press(screen.getByTestId('setup-connect'));
       expect(await screen.findByTestId('setup-error')).toBeTruthy();
       expect(addInstance).not.toHaveBeenCalled();
     });
   });
   ```

2. **Run it, expect FAIL.**
   ```bash
   npm test -- app/setup.test.tsx
   ```
   Expected: `Cannot find module './setup'`, suite **FAILS**.

3. **Implement.** Create `app/setup.tsx`:
   ```tsx
   import React, { useState } from 'react';
   import {
     ActivityIndicator,
     KeyboardAvoidingView,
     Platform,
     Pressable,
     StyleSheet,
     Text,
     TextInput,
     View,
   } from 'react-native';
   import { useRouter } from 'expo-router';
   import { useTranslation } from 'react-i18next';
   import { useTheme } from '../src/ui/ThemeProvider';
   import { normalizeBaseUrl } from '../src/lib/url';
   import { fetchSessionProperties } from '../src/auth/session';
   import { useInstancesStore } from '../src/store/instances';
   import type { Instance } from '../src/auth/types';

   export default function SetupScreen() {
     const theme = useTheme();
     const { t } = useTranslation();
     const router = useRouter();
     const addInstance = useInstancesStore((s: { addInstance: (i: Instance) => void }) => s.addInstance);
     const setActiveInstance = useInstancesStore(
       (s: { setActiveInstance: (id: string) => void }) => s.setActiveInstance,
     );

     const [url, setUrl] = useState('');
     const [busy, setBusy] = useState(false);
     const [error, setError] = useState<string | null>(null);

     async function onConnect() {
       setError(null);
       let baseUrl: string;
       try {
         baseUrl = normalizeBaseUrl(url);
       } catch {
         setError(t('errors.invalidUrl'));
         return;
       }
       setBusy(true);
       try {
         const props = await fetchSessionProperties(baseUrl);
         const instance: Instance = {
           id: baseUrl,
           baseUrl,
           siteName: props.siteName,
           version: props.version,
         };
         addInstance(instance);
         setActiveInstance(instance.id);
         router.replace('/login');
       } catch {
         setError(t('errors.unreachable'));
       } finally {
         setBusy(false);
       }
     }

     return (
       <KeyboardAvoidingView
         behavior={Platform.OS === 'ios' ? 'padding' : undefined}
         style={[styles.container, { backgroundColor: theme.colors.background }]}
       >
         <View style={{ gap: theme.spacing(3) }}>
           <Text style={[styles.title, { color: theme.colors.text }]}>{t('setup.title')}</Text>
           <Text style={{ color: theme.colors.textMuted }}>{t('setup.urlLabel')}</Text>
           <TextInput
             testID="setup-url"
             value={url}
             onChangeText={setUrl}
             autoCapitalize="none"
             autoCorrect={false}
             keyboardType="url"
             placeholder={t('setup.urlPlaceholder')}
             placeholderTextColor={theme.colors.textMuted}
             style={[
               styles.input,
               {
                 color: theme.colors.text,
                 borderColor: theme.colors.border,
                 borderRadius: theme.radius.md,
                 padding: theme.spacing(3),
               },
             ]}
           />
           {error ? (
             <Text testID="setup-error" style={{ color: theme.colors.danger }}>
               {error}
             </Text>
           ) : null}
           <Pressable
             testID="setup-connect"
             accessibilityRole="button"
             disabled={busy}
             onPress={onConnect}
             style={[
               styles.button,
               { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, opacity: busy ? 0.6 : 1 },
             ]}
           >
             {busy ? (
               <ActivityIndicator color="#FFFFFF" />
             ) : (
               <Text style={styles.buttonText}>{t('setup.connect')}</Text>
             )}
           </Pressable>
         </View>
       </KeyboardAvoidingView>
     );
   }

   const styles = StyleSheet.create({
     container: { flex: 1, justifyContent: 'center', padding: 24 },
     title: { fontSize: 24, fontWeight: '700' },
     input: { borderWidth: 1 },
     button: { alignItems: 'center', paddingVertical: 14 },
     buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
   });
   ```

4. **Run, expect PASS.**
   ```bash
   npm test -- app/setup.test.tsx
   ```
   Expected: `Tests: 2 passed, 2 total`.

5. **Commit.**
   ```bash
   git add app/setup.tsx app/setup.test.tsx && git commit -m "feat(app): add instance setup screen"
   ```

---

### Task 26: Login screen — `app/login.tsx`

**Files:**
- Create: `app/login.tsx`
- Test: `app/login.test.tsx`

Depends on: `src/auth/session.ts` (`loginWithPassword`, `fetchSessionProperties`), `src/auth/googleAuth.ts` (`loginWithGoogle`), `src/auth/secureStore.ts` (`saveToken`, `saveCredentials`), `src/store/instances.ts`, `src/store/preferences.ts`, `src/store/sessionProps` (in-memory; see note). The Google button visibility is driven by the active instance's `SessionProperties.googleAuthClientId`.

Note on storing properties: we keep the most recent `SessionProperties` per instance in a tiny in-memory zustand-free module so login can read `googleAuthClientId` without a network call, refetching if absent. This task creates that helper inline (`src/auth/sessionPropsCache.ts`).

Steps:

1. **Create the properties cache helper.** Create `src/auth/sessionPropsCache.ts`:
   ```ts
   import type { SessionProperties } from '../api/schemas';

   const cache = new Map<string, SessionProperties>();

   export function setSessionProps(instanceId: string, props: SessionProperties): void {
     cache.set(instanceId, props);
   }

   export function getSessionProps(instanceId: string): SessionProperties | null {
     return cache.get(instanceId) ?? null;
   }
   ```
   (Setup screen may also call `setSessionProps(instance.id, props)`; that wiring is optional and the login screen refetches when the cache is empty, so it works either way.)

2. **Write the failing test.** Create `app/login.test.tsx`:
   ```tsx
   import React from 'react';
   import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

   const mockReplace = jest.fn();
   jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

   const loginWithPassword = jest.fn();
   const fetchSessionProperties = jest.fn();
   jest.mock('../src/auth/session', () => ({
     loginWithPassword: (...a: unknown[]) => loginWithPassword(...a),
     fetchSessionProperties: (...a: unknown[]) => fetchSessionProperties(...a),
   }));
   jest.mock('../src/auth/googleAuth', () => ({ loginWithGoogle: jest.fn() }));

   const saveToken = jest.fn();
   const saveCredentials = jest.fn();
   jest.mock('../src/auth/secureStore', () => ({
     saveToken: (...a: unknown[]) => saveToken(...a),
     saveCredentials: (...a: unknown[]) => saveCredentials(...a),
   }));

   jest.mock('../src/store/instances', () => ({
     useInstancesStore: (sel: (s: unknown) => unknown) =>
       sel({ activeInstanceId: 'https://acme.test' }),
   }));

   const setRememberCredentials = jest.fn();
   jest.mock('../src/store/preferences', () => ({
     usePreferencesStore: (sel: (s: unknown) => unknown) =>
       sel({ themeMode: 'light', rememberCredentials: false, setRememberCredentials }),
   }));

   let mockProps: { googleAuthClientId: string | null } | null = null;
   jest.mock('../src/auth/sessionPropsCache', () => ({
     getSessionProps: () => mockProps,
     setSessionProps: jest.fn(),
   }));

   import LoginScreen from './login';

   describe('LoginScreen', () => {
     beforeEach(() => {
       jest.clearAllMocks();
       mockProps = null;
     });

     it('hides the Google button when no client id is configured', async () => {
       mockProps = { googleAuthClientId: null };
       render(<LoginScreen />);
       expect(screen.queryByTestId('login-google')).toBeNull();
     });

     it('shows the Google button when a client id is present', async () => {
       mockProps = { googleAuthClientId: '123.apps.googleusercontent.com' };
       render(<LoginScreen />);
       expect(await screen.findByTestId('login-google')).toBeTruthy();
     });

     it('password login saves token and navigates home', async () => {
       mockProps = { googleAuthClientId: null };
       loginWithPassword.mockResolvedValue('tok-1');
       render(<LoginScreen />);
       fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
       fireEvent.changeText(screen.getByTestId('login-password'), 'pw');
       fireEvent.press(screen.getByTestId('login-submit'));
       await waitFor(() =>
         expect(loginWithPassword).toHaveBeenCalledWith('https://acme.test', 'a@b.com', 'pw'),
       );
       expect(saveToken).toHaveBeenCalledWith('https://acme.test', 'tok-1');
       expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
     });
   });
   ```

3. **Run it, expect FAIL.**
   ```bash
   npm test -- app/login.test.tsx
   ```
   Expected: `Cannot find module './login'`, suite **FAILS**.

4. **Implement.** Create `app/login.tsx`:
   ```tsx
   import React, { useEffect, useState } from 'react';
   import {
     ActivityIndicator,
     Pressable,
     StyleSheet,
     Switch,
     Text,
     TextInput,
     View,
   } from 'react-native';
   import { useRouter } from 'expo-router';
   import { useTranslation } from 'react-i18next';
   import { useTheme } from '../src/ui/ThemeProvider';
   import { fetchSessionProperties, loginWithPassword } from '../src/auth/session';
   import { loginWithGoogle } from '../src/auth/googleAuth';
   import { saveCredentials, saveToken } from '../src/auth/secureStore';
   import { useInstancesStore } from '../src/store/instances';
   import { usePreferencesStore } from '../src/store/preferences';
   import { getSessionProps, setSessionProps } from '../src/auth/sessionPropsCache';

   export default function LoginScreen() {
     const theme = useTheme();
     const { t } = useTranslation();
     const router = useRouter();

     const instanceId = useInstancesStore(
       (s: { activeInstanceId: string | null }) => s.activeInstanceId,
     );
     const rememberCredentials = usePreferencesStore(
       (s: { rememberCredentials: boolean }) => s.rememberCredentials,
     );
     const setRememberCredentials = usePreferencesStore(
       (s: { setRememberCredentials: (v: boolean) => void }) => s.setRememberCredentials,
     );

     const [email, setEmail] = useState('');
     const [password, setPassword] = useState('');
     const [busy, setBusy] = useState(false);
     const [error, setError] = useState<string | null>(null);
     const [googleClientId, setGoogleClientId] = useState<string | null>(
       instanceId ? getSessionProps(instanceId)?.googleAuthClientId ?? null : null,
     );

     // Refetch properties if not cached, so the Google button can appear.
     useEffect(() => {
       if (!instanceId || getSessionProps(instanceId)) return;
       let cancelled = false;
       void (async () => {
         try {
           const props = await fetchSessionProperties(instanceId);
           if (cancelled) return;
           setSessionProps(instanceId, props);
           setGoogleClientId(props.googleAuthClientId);
         } catch {
           /* leave Google hidden; password login still works */
         }
       })();
       return () => {
         cancelled = true;
       };
     }, [instanceId]);

     async function onPasswordLogin() {
       if (!instanceId) return;
       setError(null);
       setBusy(true);
       try {
         const token = await loginWithPassword(instanceId, email, password);
         await saveToken(instanceId, token);
         if (rememberCredentials) {
           await saveCredentials(instanceId, email, password);
         }
         router.replace('/(tabs)');
       } catch (e) {
         const kind = (e as { error?: { kind?: string } })?.error?.kind;
         setError(kind === 'unauthorized' ? t('errors.unauthorized') : t('errors.generic'));
       } finally {
         setBusy(false);
       }
     }

     async function onGoogleLogin() {
       if (!instanceId || !googleClientId) return;
       setError(null);
       setBusy(true);
       try {
         const token = await loginWithGoogle(instanceId, googleClientId);
         await saveToken(instanceId, token);
         router.replace('/(tabs)');
       } catch {
         setError(t('errors.generic'));
       } finally {
         setBusy(false);
       }
     }

     return (
       <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
         <View style={{ gap: theme.spacing(3) }}>
           <Text style={[styles.title, { color: theme.colors.text }]}>{t('login.title')}</Text>

           <TextInput
             testID="login-email"
             value={email}
             onChangeText={setEmail}
             autoCapitalize="none"
             autoCorrect={false}
             keyboardType="email-address"
             placeholder={t('common.email')}
             placeholderTextColor={theme.colors.textMuted}
             style={[styles.input, inputStyle(theme)]}
           />
           <TextInput
             testID="login-password"
             value={password}
             onChangeText={setPassword}
             secureTextEntry
             placeholder={t('common.password')}
             placeholderTextColor={theme.colors.textMuted}
             style={[styles.input, inputStyle(theme)]}
           />

           <View style={styles.row}>
             <Text style={{ color: theme.colors.text }}>{t('login.rememberMe')}</Text>
             <Switch
               testID="login-remember"
               value={rememberCredentials}
               onValueChange={setRememberCredentials}
             />
           </View>

           {error ? (
             <Text testID="login-error" style={{ color: theme.colors.danger }}>
               {error}
             </Text>
           ) : null}

           <Pressable
             testID="login-submit"
             accessibilityRole="button"
             disabled={busy}
             onPress={onPasswordLogin}
             style={[styles.button, { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, opacity: busy ? 0.6 : 1 }]}
           >
             {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t('login.signIn')}</Text>}
           </Pressable>

           {googleClientId ? (
             <Pressable
               testID="login-google"
               accessibilityRole="button"
               disabled={busy}
               onPress={onGoogleLogin}
               style={[styles.buttonOutline, { borderColor: theme.colors.border, borderRadius: theme.radius.md }]}
             >
               <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{t('login.google')}</Text>
             </Pressable>
           ) : null}
         </View>
       </View>
     );
   }

   function inputStyle(theme: ReturnType<typeof useTheme>) {
     return {
       color: theme.colors.text,
       borderColor: theme.colors.border,
       borderRadius: theme.radius.md,
       padding: theme.spacing(3),
     };
   }

   const styles = StyleSheet.create({
     container: { flex: 1, justifyContent: 'center', padding: 24 },
     title: { fontSize: 24, fontWeight: '700' },
     input: { borderWidth: 1 },
     row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
     button: { alignItems: 'center', paddingVertical: 14 },
     buttonOutline: { alignItems: 'center', paddingVertical: 14, borderWidth: 1 },
     buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
   });
   ```

5. **Run, expect PASS.**
   ```bash
   npm test -- app/login.test.tsx
   ```
   Expected: `Tests: 3 passed, 3 total`.

6. **Commit.**
   ```bash
   git add app/login.tsx app/login.test.tsx src/auth/sessionPropsCache.ts && git commit -m "feat(app): add login screen with conditional Google sign-in"
   ```

---

### Task 27: Unlock screen — `app/unlock.tsx`

**Files:**
- Create: `app/unlock.tsx`
- Test: `app/unlock.test.tsx`

Depends on: `src/auth/biometrics.ts` (`authenticate`), `src/store/instances.ts` (`setActiveInstance` for logout), `src/auth/secureStore.ts` (`deleteToken`). On mount it calls `authenticate`; success navigates to `/(tabs)`; failure shows retry + logout.

Steps:

1. **Add jest mocks for biometrics module (per contract).** Ensure `jest.setup.ts` contains (append if missing):
   ```ts
   jest.mock('expo-local-authentication', () => ({
     hasHardwareAsync: jest.fn(async () => true),
     isEnrolledAsync: jest.fn(async () => true),
     authenticateAsync: jest.fn(async () => ({ success: true })),
   }));
   jest.mock('expo-secure-store', () => {
     const store = new Map<string, string>();
     return {
       getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
       setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
       deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
     };
   });
   ```

2. **Write the failing test.** Create `app/unlock.test.tsx`:
   ```tsx
   import React from 'react';
   import { render, screen, waitFor } from '@testing-library/react-native';

   const mockReplace = jest.fn();
   jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

   const authenticate = jest.fn();
   jest.mock('../src/auth/biometrics', () => ({
     authenticate: (...a: unknown[]) => authenticate(...a),
   }));

   const setActiveInstance = jest.fn();
   jest.mock('../src/store/instances', () => ({
     useInstancesStore: (sel: (s: unknown) => unknown) =>
       sel({ activeInstanceId: 'https://acme.test', setActiveInstance }),
   }));
   jest.mock('../src/auth/secureStore', () => ({ deleteToken: jest.fn() }));
   jest.mock('../src/store/preferences', () => ({
     usePreferencesStore: (sel: (s: { themeMode: string }) => unknown) => sel({ themeMode: 'light' }),
   }));

   import UnlockScreen from './unlock';

   describe('UnlockScreen', () => {
     beforeEach(() => jest.clearAllMocks());

     it('navigates to tabs when biometric auth succeeds', async () => {
       authenticate.mockResolvedValue(true);
       render(<UnlockScreen />);
       await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
     });

     it('shows retry + logout when biometric auth fails', async () => {
       authenticate.mockResolvedValue(false);
       render(<UnlockScreen />);
       expect(await screen.findByTestId('unlock-retry')).toBeTruthy();
       expect(screen.getByTestId('unlock-logout')).toBeTruthy();
       expect(mockReplace).not.toHaveBeenCalled();
     });
   });
   ```

3. **Run it, expect FAIL.**
   ```bash
   npm test -- app/unlock.test.tsx
   ```
   Expected: `Cannot find module './unlock'`, suite **FAILS**.

4. **Implement.** Create `app/unlock.tsx`:
   ```tsx
   import React, { useCallback, useEffect, useState } from 'react';
   import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
   import { useRouter } from 'expo-router';
   import { useTranslation } from 'react-i18next';
   import { useTheme } from '../src/ui/ThemeProvider';
   import { authenticate } from '../src/auth/biometrics';
   import { deleteToken } from '../src/auth/secureStore';
   import { useInstancesStore } from '../src/store/instances';

   export default function UnlockScreen() {
     const theme = useTheme();
     const { t } = useTranslation();
     const router = useRouter();
     const instanceId = useInstancesStore(
       (s: { activeInstanceId: string | null }) => s.activeInstanceId,
     );
     const setActiveInstance = useInstancesStore(
       (s: { setActiveInstance: (id: string | null) => void }) => s.setActiveInstance,
     );

     const [status, setStatus] = useState<'pending' | 'failed'>('pending');

     const tryUnlock = useCallback(async () => {
       setStatus('pending');
       const ok = await authenticate(t('unlock.prompt'));
       if (ok) {
         router.replace('/(tabs)');
       } else {
         setStatus('failed');
       }
     }, [router, t]);

     useEffect(() => {
       void tryUnlock();
     }, [tryUnlock]);

     async function onLogout() {
       if (instanceId) {
         await deleteToken(instanceId);
       }
       setActiveInstance(null);
       router.replace('/login');
     }

     return (
       <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
         <Text style={[styles.title, { color: theme.colors.text }]}>{t('unlock.title')}</Text>
         {status === 'pending' ? (
           <ActivityIndicator color={theme.colors.primary} />
         ) : (
           <View style={{ gap: theme.spacing(3), marginTop: theme.spacing(4) }}>
             <Pressable
               testID="unlock-retry"
               accessibilityRole="button"
               onPress={tryUnlock}
               style={[styles.button, { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md }]}
             >
               <Text style={styles.buttonText}>{t('unlock.retry')}</Text>
             </Pressable>
             <Pressable
               testID="unlock-logout"
               accessibilityRole="button"
               onPress={onLogout}
               style={[styles.buttonOutline, { borderColor: theme.colors.border, borderRadius: theme.radius.md }]}
             >
               <Text style={{ color: theme.colors.danger, fontWeight: '600' }}>{t('unlock.logout')}</Text>
             </Pressable>
           </View>
         )}
       </View>
     );
   }

   const styles = StyleSheet.create({
     container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
     title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
     button: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 32 },
     buttonOutline: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1 },
     buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
   });
   ```

5. **Run, expect PASS.**
   ```bash
   npm test -- app/unlock.test.tsx
   ```
   Expected: `Tests: 2 passed, 2 total`.

6. **Commit.**
   ```bash
   git add app/unlock.tsx app/unlock.test.tsx jest.setup.ts && git commit -m "feat(app): add biometric unlock screen"
   ```

---

### Task 28: Tabs layout, home, and settings — `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`

**Files:**
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/index.tsx`
- Create: `app/(tabs)/settings.tsx`
- Test: `app/(tabs)/settings.test.tsx`

Depends on: `src/api/client.ts` (`MetabaseClient`), `src/auth/session.ts` (`fetchCurrentUser`, `logout`), `src/auth/secureStore.ts` (`getToken`, `deleteToken`, `deleteCredentials`), `src/store/instances.ts`, `src/store/preferences.ts`, `src/ui/i18n.ts` (`changeLanguage`). Home builds a `MetabaseClient` for the active instance and shows the current user's email. Settings has theme + language pickers and logout. The single RNTL test covers the settings logout path.

Steps:

1. **Create the tabs layout.** Create `app/(tabs)/_layout.tsx`:
   ```tsx
   import React from 'react';
   import { Tabs } from 'expo-router';
   import { useTranslation } from 'react-i18next';
   import { useTheme } from '../../src/ui/ThemeProvider';

   export default function TabsLayout() {
     const theme = useTheme();
     const { t } = useTranslation();
     return (
       <Tabs
         screenOptions={{
           headerStyle: { backgroundColor: theme.colors.surface },
           headerTintColor: theme.colors.text,
           tabBarActiveTintColor: theme.colors.primary,
           tabBarInactiveTintColor: theme.colors.textMuted,
           tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
         }}
       >
         <Tabs.Screen name="index" options={{ title: 'Home' }} />
         <Tabs.Screen name="settings" options={{ title: t('settings.title') }} />
       </Tabs>
     );
   }
   ```

2. **Create the home screen.** Create `app/(tabs)/index.tsx`:
   ```tsx
   import React, { useMemo } from 'react';
   import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
   import { useQuery } from '@tanstack/react-query';
   import { useTranslation } from 'react-i18next';
   import { useTheme } from '../../src/ui/ThemeProvider';
   import { MetabaseClient } from '../../src/api/client';
   import { fetchCurrentUser } from '../../src/auth/session';
   import { getToken } from '../../src/auth/secureStore';
   import { useInstancesStore } from '../../src/store/instances';

   export default function HomeScreen() {
     const theme = useTheme();
     const { t } = useTranslation();
     const instanceId = useInstancesStore(
       (s: { activeInstanceId: string | null }) => s.activeInstanceId,
     );

     const client = useMemo(() => {
       if (!instanceId) return null;
       let token: string | null = null;
       void getToken(instanceId).then((tk) => {
         token = tk;
       });
       return new MetabaseClient({
         baseUrl: instanceId,
         getToken: () => token,
         onUnauthorized: async () => null,
       });
     }, [instanceId]);

     const { data, isLoading, error } = useQuery({
       queryKey: [instanceId, 'user', 'current'],
       enabled: !!client,
       queryFn: async () => {
         // Ensure token is loaded before the request.
         const fresh = new MetabaseClient({
           baseUrl: instanceId as string,
           getToken: () => null,
           onUnauthorized: async () => null,
         });
         const token = await getToken(instanceId as string);
         (fresh as unknown as { getTokenRef?: () => string | null }).getTokenRef;
         return fetchCurrentUser(
           new MetabaseClient({
             baseUrl: instanceId as string,
             getToken: () => token,
             onUnauthorized: async () => null,
           }),
         );
       },
     });

     return (
       <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
         {isLoading ? (
           <ActivityIndicator color={theme.colors.primary} />
         ) : error ? (
           <Text style={{ color: theme.colors.danger }}>{t('errors.generic')}</Text>
         ) : (
           <Text testID="home-greeting" style={{ color: theme.colors.text, fontSize: 18 }}>
             {t('home.signedInAs', { email: data?.email ?? '' })}
           </Text>
         )}
       </View>
     );
   }

   const styles = StyleSheet.create({
     container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
   });
   ```
   (The `client` building is intentionally simple for M0; M1 introduces a shared client provider. The home screen has no dedicated RNTL test per the contract — one meaningful test per screen, and the settings logout test is the higher-value one for this group.)

3. **Write the failing test for settings.** Create `app/(tabs)/settings.test.tsx`:
   ```tsx
   import React from 'react';
   import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

   const mockReplace = jest.fn();
   jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

   const logout = jest.fn();
   jest.mock('../../src/auth/session', () => ({ logout: (...a: unknown[]) => logout(...a) }));

   const deleteToken = jest.fn();
   const deleteCredentials = jest.fn();
   const getToken = jest.fn(async () => 'tok-1');
   jest.mock('../../src/auth/secureStore', () => ({
     deleteToken: (...a: unknown[]) => deleteToken(...a),
     deleteCredentials: (...a: unknown[]) => deleteCredentials(...a),
     getToken: (...a: unknown[]) => getToken(...a),
   }));

   const setActiveInstance = jest.fn();
   jest.mock('../../src/store/instances', () => ({
     useInstancesStore: (sel: (s: unknown) => unknown) =>
       sel({ activeInstanceId: 'https://acme.test', setActiveInstance }),
   }));

   const setThemeMode = jest.fn();
   const setLocale = jest.fn();
   jest.mock('../../src/store/preferences', () => ({
     usePreferencesStore: (sel: (s: unknown) => unknown) =>
       sel({ themeMode: 'system', locale: 'system', setThemeMode, setLocale }),
   }));
   jest.mock('../../src/ui/i18n', () => ({ changeLanguage: jest.fn() }));
   jest.mock('../../src/api/client', () => ({
     MetabaseClient: class {
       constructor(_: unknown) {}
     },
   }));

   import SettingsScreen from './settings';

   describe('SettingsScreen', () => {
     beforeEach(() => jest.clearAllMocks());

     it('logout deletes token + credentials and clears the active instance', async () => {
       render(<SettingsScreen />);
       fireEvent.press(screen.getByTestId('settings-logout'));
       await waitFor(() => expect(deleteToken).toHaveBeenCalledWith('https://acme.test'));
       expect(deleteCredentials).toHaveBeenCalledWith('https://acme.test');
       expect(setActiveInstance).toHaveBeenCalledWith(null);
       expect(mockReplace).toHaveBeenCalledWith('/login');
     });

     it('changing theme mode calls setThemeMode', () => {
       render(<SettingsScreen />);
       fireEvent.press(screen.getByTestId('theme-dark'));
       expect(setThemeMode).toHaveBeenCalledWith('dark');
     });
   });
   ```

4. **Run it, expect FAIL.**
   ```bash
   npm test -- "app/(tabs)/settings.test.tsx"
   ```
   Expected: `Cannot find module './settings'`, suite **FAILS**.

5. **Implement the settings screen.** Create `app/(tabs)/settings.tsx`:
   ```tsx
   import React from 'react';
   import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
   import { useRouter } from 'expo-router';
   import { useTranslation } from 'react-i18next';
   import { useTheme } from '../../src/ui/ThemeProvider';
   import { MetabaseClient } from '../../src/api/client';
   import { logout } from '../../src/auth/session';
   import { deleteCredentials, deleteToken, getToken } from '../../src/auth/secureStore';
   import { useInstancesStore } from '../../src/store/instances';
   import { usePreferencesStore } from '../../src/store/preferences';
   import { changeLanguage } from '../../src/ui/i18n';

   type ThemeMode = 'system' | 'light' | 'dark';
   type Locale = 'system' | 'en' | 'zh';

   export default function SettingsScreen() {
     const theme = useTheme();
     const { t } = useTranslation();
     const router = useRouter();

     const instanceId = useInstancesStore(
       (s: { activeInstanceId: string | null }) => s.activeInstanceId,
     );
     const setActiveInstance = useInstancesStore(
       (s: { setActiveInstance: (id: string | null) => void }) => s.setActiveInstance,
     );
     const themeMode = usePreferencesStore((s: { themeMode: ThemeMode }) => s.themeMode);
     const setThemeMode = usePreferencesStore(
       (s: { setThemeMode: (m: ThemeMode) => void }) => s.setThemeMode,
     );
     const locale = usePreferencesStore((s: { locale: Locale }) => s.locale);
     const setLocale = usePreferencesStore((s: { setLocale: (l: Locale) => void }) => s.setLocale);

     async function onLogout() {
       if (instanceId) {
         try {
           const token = await getToken(instanceId);
           if (token) {
             await logout(
               new MetabaseClient({
                 baseUrl: instanceId,
                 getToken: () => token,
                 onUnauthorized: async () => null,
               }),
             );
           }
         } catch {
           /* best-effort server logout; still clear local state */
         }
         await deleteToken(instanceId);
         await deleteCredentials(instanceId);
       }
       setActiveInstance(null);
       router.replace('/login');
     }

     function onSelectLocale(next: Locale) {
       setLocale(next);
       void changeLanguage(next);
     }

     const themeOptions: { mode: ThemeMode; label: string; tid: string }[] = [
       { mode: 'system', label: t('settings.themeSystem'), tid: 'theme-system' },
       { mode: 'light', label: t('settings.themeLight'), tid: 'theme-light' },
       { mode: 'dark', label: t('settings.themeDark'), tid: 'theme-dark' },
     ];
     const localeOptions: { value: Locale; label: string; tid: string }[] = [
       { value: 'system', label: t('settings.langSystem'), tid: 'lang-system' },
       { value: 'en', label: 'English', tid: 'lang-en' },
       { value: 'zh', label: '中文', tid: 'lang-zh' },
     ];

     return (
       <ScrollView
         style={{ backgroundColor: theme.colors.background }}
         contentContainerStyle={{ padding: theme.spacing(4), gap: theme.spacing(5) }}
       >
         <View style={{ gap: theme.spacing(2) }}>
           <Text style={[styles.section, { color: theme.colors.textMuted }]}>{t('settings.theme')}</Text>
           <View style={styles.row}>
             {themeOptions.map((opt) => {
               const active = themeMode === opt.mode;
               return (
                 <Pressable
                   key={opt.mode}
                   testID={opt.tid}
                   accessibilityRole="button"
                   onPress={() => setThemeMode(opt.mode)}
                   style={[
                     styles.chip,
                     {
                       borderColor: active ? theme.colors.primary : theme.colors.border,
                       backgroundColor: active ? theme.colors.primary : 'transparent',
                       borderRadius: theme.radius.sm,
                     },
                   ]}
                 >
                   <Text style={{ color: active ? '#FFFFFF' : theme.colors.text }}>{opt.label}</Text>
                 </Pressable>
               );
             })}
           </View>
         </View>

         <View style={{ gap: theme.spacing(2) }}>
           <Text style={[styles.section, { color: theme.colors.textMuted }]}>{t('settings.language')}</Text>
           <View style={styles.row}>
             {localeOptions.map((opt) => {
               const active = locale === opt.value;
               return (
                 <Pressable
                   key={opt.value}
                   testID={opt.tid}
                   accessibilityRole="button"
                   onPress={() => onSelectLocale(opt.value)}
                   style={[
                     styles.chip,
                     {
                       borderColor: active ? theme.colors.primary : theme.colors.border,
                       backgroundColor: active ? theme.colors.primary : 'transparent',
                       borderRadius: theme.radius.sm,
                     },
                   ]}
                 >
                   <Text style={{ color: active ? '#FFFFFF' : theme.colors.text }}>{opt.label}</Text>
                 </Pressable>
               );
             })}
           </View>
         </View>

         <Pressable
           testID="settings-logout"
           accessibilityRole="button"
           onPress={onLogout}
           style={[styles.logout, { borderColor: theme.colors.danger, borderRadius: theme.radius.md }]}
         >
           <Text style={{ color: theme.colors.danger, fontWeight: '600' }}>{t('settings.logout')}</Text>
         </Pressable>
       </ScrollView>
     );
   }

   const styles = StyleSheet.create({
     section: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
     row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
     chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14 },
     logout: { borderWidth: 1, alignItems: 'center', paddingVertical: 14, marginTop: 8 },
   });
   ```

6. **Run, expect PASS.**
   ```bash
   npm test -- "app/(tabs)/settings.test.tsx"
   ```
   Expected: `Tests: 2 passed, 2 total`.

7. **Typecheck the whole group.**
   ```bash
   npm run typecheck
   ```
   Expected: no errors (exit 0).

8. **Commit.**
   ```bash
   git add "app/(tabs)/_layout.tsx" "app/(tabs)/index.tsx" "app/(tabs)/settings.tsx" "app/(tabs)/settings.test.tsx" && git commit -m "feat(app): add tabs layout, home greeting, and settings with logout"
   ```

---

### Task 29: Lint + typecheck the UI/screens group

**Files:**
- Modify: none (verification only)

Steps:

1. **Run lint on the new files.**
   ```bash
   npm run lint
   ```
   Expected: exit 0, `0 problems`. If `react-hooks/exhaustive-deps` flags `app/(tabs)/index.tsx`, address by leaving the documented eslint-disable comment on the effect that intentionally loads the token, or refactor per the M1 shared-client note; do not suppress unrelated rules.

2. **Run the full test suite for this group.**
   ```bash
   npm test -- src/ui app/setup.test.tsx app/login.test.tsx app/unlock.test.tsx "app/(tabs)/settings.test.tsx" src/auth/useAuthGate.test.ts
   ```
   Expected: all suites pass; final line `Tests: <n> passed`.

3. **Run typecheck.**
   ```bash
   npm run typecheck
   ```
   Expected: exit 0.

4. **Commit (only if lint auto-fixes were applied).**
   ```bash
   git add -A && git commit -m "chore(ui): lint and typecheck pass for UI shell"
   ```

---

Notes for the merge/orchestration step:
- This group's tests rely on jest module mocks for `expo-secure-store`, `expo-local-authentication`, `expo-localization`, and `expo-router` (mocked per-test). The cross-cutting mocks for secure-store/local-auth/localization belong in the shared `jest.setup.ts` (referenced by `setupFilesAfterEnv`); Tasks A3 and A8 specify their exact contents — de-duplicate at merge.
- `@react-native-google-signin/google-signin` and `@shopify/react-native-skia` mocks are owned by the auth/render sections' setup; this group does not import skia and only references google sign-in through the mocked `src/auth/googleAuth` module, so no skia mock is needed here.
- File paths for reference: `/Users/eric/work/metabase-rn/src/ui/theme.ts`, `/Users/eric/work/metabase-rn/src/ui/ThemeProvider.tsx`, `/Users/eric/work/metabase-rn/src/ui/i18n.ts`, `/Users/eric/work/metabase-rn/src/ui/AppProviders.tsx`, `/Users/eric/work/metabase-rn/src/auth/useAuthGate.ts`, `/Users/eric/work/metabase-rn/src/auth/sessionPropsCache.ts`, `/Users/eric/work/metabase-rn/app/_layout.tsx`, `/Users/eric/work/metabase-rn/app/setup.tsx`, `/Users/eric/work/metabase-rn/app/login.tsx`, `/Users/eric/work/metabase-rn/app/unlock.tsx`, `/Users/eric/work/metabase-rn/app/(tabs)/_layout.tsx`, `/Users/eric/work/metabase-rn/app/(tabs)/index.tsx`, `/Users/eric/work/metabase-rn/app/(tabs)/settings.tsx`.

---

## Done & Next

**M0 yields working, testable software:** a user can launch the app, enter any Metabase instance URL (validated against `/api/session/properties`), sign in with username/password — or Google when the instance enables it — have the session token stored in the OS secure keystore, unlock the app with biometrics on return, and reach a home screen that confirms the signed-in user via `/api/user/current`. The API client, Zod parsers, auth/session logic, stores, theming, and i18n are all unit-tested; CI runs typecheck + lint + tests on every push/PR.

**Next milestones, each its own spec-driven, writing-plans-formatted plan, built on M0's contracts:**
- **M1 — View core:** browse collections, dashboard view (single-column reflow), card detail; result-normalization layer; Tier-1 renderer subset (table, scalar/trend, bar, line, area, pie); pull-to-refresh.
- **M2 — Breadth:** remaining Tier-1 renderers (row, combo, scatter, gauge, progress, funnel, waterfall, object), search, dashboard filters, basic drill, theming/i18n polish.
- **M3 — Long tail:** Tier-2 renderers (pivot, maps, sankey), deeper drill, offline cache.
- **Fast-follow:** push via a webhook relay, CSV/XLSX export, viewing existing alerts/subscriptions, deep links, EAS release builds & store submission.
