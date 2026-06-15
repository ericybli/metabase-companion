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

// ---- Dashboard list (GET /api/dashboard) ----
export interface DashboardSummary {
  id: number;
  name: string;
  description: string | null;
}

export const DashboardSummarySchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
  })
  .passthrough()
  .transform(
    (raw): DashboardSummary => ({
      id: raw.id,
      name: raw.name,
      description: raw.description ?? null,
    }),
  );

// Tolerant of both a bare array and a `{ data: [...] }` envelope across versions.
export const DashboardListSchema = z.union([
  z.array(DashboardSummarySchema),
  z
    .object({ data: z.array(DashboardSummarySchema) })
    .passthrough()
    .transform((o) => o.data),
]);

// ---- Dashboard detail (GET /api/dashboard/:id) ----
export interface DashboardCard {
  dashcardId: number;
  cardId: number;
  name: string;
  display: string | null;
}
export interface DashboardDetail {
  id: number;
  name: string;
  description: string | null;
  cards: DashboardCard[];
}

const DashcardSchema = z
  .object({
    id: z.number(),
    card_id: z.number().nullable().optional(),
    card: z
      .object({
        id: z.number().optional(),
        name: z.string().nullable().optional(),
        display: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const DashboardDetailSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
    // `dashcards` (v0.50+) with `ordered_cards` as the older fallback.
    dashcards: z.array(DashcardSchema).nullable().optional(),
    ordered_cards: z.array(DashcardSchema).nullable().optional(),
  })
  .passthrough()
  .transform((raw): DashboardDetail => {
    const dcs = raw.dashcards ?? raw.ordered_cards ?? [];
    const cards: DashboardCard[] = dcs
      .filter((dc): dc is typeof dc & { card_id: number } => dc.card_id != null && dc.card != null)
      .map((dc) => ({
        dashcardId: dc.id,
        cardId: dc.card_id,
        name: dc.card?.name ?? '',
        display: dc.card?.display ?? null,
      }));
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description ?? null,
      cards,
    };
  });
