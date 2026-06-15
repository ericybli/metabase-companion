# Metabase Companion

A fast, native **read-only mobile client for [Metabase](https://github.com/metabase/metabase)**, built with React Native (Expo). Add any Metabase instance, sign in, and browse your dashboards and questions from your phone.

> **Unofficial.** This is a community project and is **not affiliated with, or endorsed by, Metabase, Inc.** "Metabase" is a trademark of Metabase, Inc.

## What it is

- Works with **any** Metabase instance — Metabase Cloud or self-hosted; Open Source, Pro, or Enterprise (minimum **v0.48+**).
- **Read-only:** the app never creates, edits, or deletes content in your instance.
- **No backend of ours:** the app talks **directly** to the Metabase REST API. Your credentials and session tokens stay on your device (tokens in the OS secure keystore via `expo-secure-store`).
- Password login, and Google sign-in when your instance enables it, with optional biometric unlock.
- Native rendering of dashboards and charts (rolling out by chart type across milestones).

## Quickstart (development)

```bash
git clone <this-repo-url>
cd metabase-rn
npm install
npm start          # start the Metro dev server
```

Then open the project in a simulator/emulator, or in a development build (see below).

### Scripts

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm start`         | Start the Expo dev server                 |
| `npm run tunnel`    | Dev server over a tunnel (remote Expo Go) |
| `npm run ios`       | Start + open iOS simulator                |
| `npm run android`   | Start + open Android emulator             |
| `npm run typecheck` | TypeScript type-check (no emit)           |
| `npm run lint`      | ESLint (Expo config)                      |
| `npm run format`    | Format with Prettier                      |
| `npm test`          | Run the Jest test suite                   |

### Development build required for some features

Google sign-in (`@react-native-google-signin/google-signin`) and native chart rendering
(`@shopify/react-native-skia`) use custom native code and **do not run in Expo Go**. To exercise
those features, build a development build:

```bash
npx expo run:ios       # or: npx expo run:android
```

Everything else runs in Expo Go for fast iteration.

> **Google sign-in setup (optional):** native Google sign-in requires you to create your own
> Google OAuth client for the app and add the `@react-native-google-signin/google-signin` config
> plugin (with your `iosUrlScheme`) to `app.json`. Until then, use username/password — which works
> on every Metabase instance.

### Remote access (Expo Go over the internet)

If your phone isn't on the same Wi-Fi as your computer, run the dev server through a tunnel so
Expo Go can reach it from any network (the JS bundle is served via ngrok):

```bash
npm run tunnel        # = expo start --tunnel
```

The first run prompts to install `@expo/ngrok` (one-time — press `Y`). Then scan the QR with Expo
Go over cellular or any Wi-Fi. The app still talks directly to your Metabase, so that instance must
be reachable from the phone — a public URL works anywhere; a LAN/localhost instance does not.

## Tech stack

Expo (managed) · TypeScript (strict) · Expo Router · TanStack Query · Zustand · Zod ·
i18next (en/zh) · expo-secure-store · expo-local-authentication · Victory Native + Skia (charts).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[Apache-2.0](./LICENSE) © 2026 Metabase Companion contributors.
