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

Run the full local check suite; **all must pass** (CI runs the same):

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

## Guidelines

- **TypeScript strict mode** is on. Avoid `any`; prefer precise types and Zod schemas at API boundaries.
- **Test logic.** Anything with branching, parsing, or state gets a test. We use `jest-expo`,
  `@testing-library/react-native`, and `msw` (for HTTP).
- **Read-only invariant.** Never add code that mutates a user's Metabase instance. The only writes
  to the API are the auth/session endpoints (`/api/session`, `/api/session/google_auth`).
- **Conventional Commits** for messages, e.g. `feat: add instance switcher`, `fix: handle 401 retry`.
- **Keep secrets on device.** Session tokens live only in `expo-secure-store`; never log them.
- Update `CHANGELOG.md` under `## [Unreleased]` for user-facing changes.

## Project layout

- `src/app/` — Expo Router routes (screens)
- `src/api/` — typed Metabase REST client + Zod schemas
- `src/auth/` — session, secure storage, biometrics, Google
- `src/store/` — Zustand stores
- `src/ui/` — design system, theme, i18n, providers
- `src/lib/` — shared utilities

## Reporting bugs / requesting features

Open a GitHub issue with steps to reproduce, your Metabase version, and the app version.
Please **never** paste real session tokens, passwords, or private instance URLs.

## License of contributions

By contributing, you agree your contributions are licensed under the project's [MIT License](./LICENSE).
