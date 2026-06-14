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

const VersionSchema = z.object({ tag: z.string() }).partial().passthrough().optional().nullable();

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
