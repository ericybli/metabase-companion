# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffold: Expo (managed, SDK 56) + TypeScript (strict) + Expo Router.
- Tooling: ESLint (Expo config) + Prettier, Jest (jest-expo) + React Native Testing Library + MSW, GitHub Actions CI.
- **M0 Foundation** — typed Metabase REST client (`MetabaseClient`) with `X-Metabase-Session`
  auth header and single-retry 401 handling; Zod defensive parsing of session properties /
  current user / session token; instance setup with capability detection; password and
  (conditional) Google sign-in; session token stored in the OS secure keystore with biometric
  unlock; persisted instances + preferences stores; theming (light/dark) and i18n (en/zh);
  Expo Router screens (setup, login, unlock, tabs: home + settings) with an auth-gating root layout.

### Notes

- Deferred to M1: a shared `MetabaseClient` provider so the 401 retry performs live re-auth
  (Google re-sign-in / remembered-credentials re-login); the `Account` type (single-account flow
  for now). Native Google sign-in additionally requires a per-app Google OAuth client (documented
  setup) before it can run on device.
