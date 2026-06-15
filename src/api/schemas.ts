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
export interface DashboardTab {
  id: number;
  name: string;
}

export interface DashboardCard {
  dashcardId: number;
  cardId: number;
  name: string;
  display: string | null;
  vizSettings: Record<string, unknown>;
  tabId: number | null;
}

/** A dashboard filter/parameter as returned by GET /api/dashboard/:id. */
export interface DashboardParameter {
  id: string;
  slug: string;
  /** Human-readable label; falls back to the slug, then '' when neither is set. */
  name: string;
  /** Metabase parameter type, e.g. 'date/all-options','number/=','category'; '' when absent. */
  type: string;
  /** The parameter's default value; null when not set. */
  default: unknown;
  /**
   * Static list values for a dropdown, taken from
   * `values_source_config.values` when `values_source_type === 'static-list'`
   * (each mapped to a string); `[]` otherwise.
   */
  values: string[];
  /**
   * Raw `values_source_type` ('static-list', 'card', or a field-backed source
   * like ''); '' when absent. A non-empty, non-'static-list' value means the
   * options are fetched lazily from the server.
   */
  valuesSourceType: string;
}

export interface DashboardDetail {
  id: number;
  name: string;
  description: string | null;
  cards: DashboardCard[];
  parameters: DashboardParameter[];
  tabs: DashboardTab[];
}

// ---- QueryResult (POST .../query) ----
export interface QueryColumn {
  name: string;
  displayName: string;
  baseType: string; // e.g. 'type/Integer','type/Float','type/Text','type/DateTime'
  semanticType: string | null; // e.g. 'type/Currency','type/Percentage', or null
}
export interface QueryResult {
  rows: unknown[][];
  cols: QueryColumn[];
  rowCount: number;
  status: string;
  error: string | null;
}

const QueryColumnSchema = z
  .object({
    name: z.string(),
    display_name: z.string(),
    base_type: z.string(),
    semantic_type: z.string().nullable().optional(),
  })
  .passthrough()
  .transform(
    (raw): QueryColumn => ({
      name: raw.name,
      displayName: raw.display_name,
      baseType: raw.base_type,
      semanticType: raw.semantic_type ?? null,
    }),
  );

export const QueryResultSchema = z
  .object({
    data: z
      .object({
        rows: z.array(z.array(z.unknown())),
        cols: z.array(QueryColumnSchema),
      })
      .passthrough(),
    row_count: z.number().optional(),
    status: z.string().optional(),
    error: z.string().nullable().optional(),
  })
  .passthrough()
  .transform(
    (raw): QueryResult => ({
      rows: raw.data.rows,
      cols: raw.data.cols,
      rowCount: raw.row_count ?? raw.data.rows.length,
      status: raw.status ?? 'completed',
      error: raw.error ?? null,
    }),
  );

const DashcardSchema = z
  .object({
    id: z.number(),
    card_id: z.number().nullable().optional(),
    dashboard_tab_id: z.number().nullable().optional(),
    card: z
      .object({
        id: z.number().optional(),
        name: z.string().nullable().optional(),
        display: z.string().nullable().optional(),
        visualization_settings: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const DashboardTabRawSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    position: z.number().optional(),
  })
  .passthrough();

const DashboardParameterSchema = z
  .object({
    id: z.string().optional(),
    slug: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    default: z.unknown().optional(),
    values_source_type: z.string().nullable().optional(),
    values_source_config: z
      .object({ values: z.array(z.unknown()).optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()
  .transform((raw): DashboardParameter => {
    const valuesSourceType = raw.values_source_type ?? '';
    const values =
      valuesSourceType === 'static-list'
        ? (raw.values_source_config?.values ?? []).map((v) => String(v))
        : [];
    return {
      id: raw.id ?? '',
      slug: raw.slug ?? '',
      name: raw.name ?? raw.slug ?? '',
      type: raw.type ?? '',
      default: raw.default !== undefined ? raw.default : null,
      values,
      valuesSourceType,
    };
  });

export const DashboardDetailSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
    // `dashcards` (v0.50+) with `ordered_cards` as the older fallback.
    dashcards: z.array(DashcardSchema).nullable().optional(),
    ordered_cards: z.array(DashcardSchema).nullable().optional(),
    parameters: z.array(DashboardParameterSchema).nullable().optional(),
    tabs: z.array(DashboardTabRawSchema).nullable().optional(),
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
        vizSettings: dc.card?.visualization_settings ?? {},
        tabId: dc.dashboard_tab_id ?? null,
      }));
    const parameters: DashboardParameter[] = raw.parameters ?? [];
    const rawTabs = raw.tabs ?? [];
    const tabs: DashboardTab[] = [...rawTabs]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((t) => ({ id: t.id, name: t.name }));
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description ?? null,
      cards,
      parameters,
      tabs,
    };
  });
