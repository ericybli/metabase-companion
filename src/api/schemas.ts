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

/**
 * One per-dashcard mapping that connects a dashboard parameter to a column/field
 * on this card. Parsed from each dashcard's `parameter_mappings` entries
 * (`{ parameter_id, card_id, target }`); `target` is Metabase's dimension/
 * variable reference, kept as `unknown` for the cross-filter resolver to inspect.
 */
export interface DashboardCardParameterMapping {
  parameterId: string;
  target: unknown;
}

export interface DashboardCard {
  dashcardId: number;
  cardId: number;
  name: string;
  display: string | null;
  vizSettings: Record<string, unknown>;
  tabId: number | null;
  /**
   * Parameter→column mappings for THIS card, used to resolve which dashboard
   * parameter a clicked dimension cross-filters. `[]` when the card has none.
   */
  parameterMappings: DashboardCardParameterMapping[];
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

// ---- CardDetail (GET /api/card/:id) ----
// A standalone saved question. We keep only what's needed to render it as a
// card: its display, visualization settings, name, and optional description.
export interface CardDetail {
  id: number;
  name: string;
  display: string;
  visualizationSettings: Record<string, unknown>;
  description: string | null;
}

export const CardDetailSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    display: z.string(),
    visualization_settings: z.record(z.string(), z.unknown()).nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough()
  .transform(
    (raw): CardDetail => ({
      id: raw.id,
      name: raw.name,
      display: raw.display,
      visualizationSettings: raw.visualization_settings ?? {},
      description: raw.description ?? null,
    }),
  );

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

// ---- Search results (GET /api/search) ----
// Metabase returns `{ data: [...], ... }` where each entry describes one
// searchable item. `id` can be a number or string and `model` identifies the
// kind ('dashboard','card','dataset','metric','table',…). We keep only the
// fields we render and tolerate any extra/missing keys defensively.
export interface SearchResult {
  id: number | string;
  name: string;
  model: string;
  description: string | null;
}

const SearchResultItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough()
  .transform(
    (raw): SearchResult => ({
      id: raw.id,
      name: raw.name ?? '',
      model: raw.model ?? '',
      description: raw.description ?? null,
    }),
  );

// Unwraps the `{ data: [...] }` envelope; also tolerates a bare array. Entries
// that fail to parse (e.g. missing id) are dropped rather than failing the page.
export const SearchResultSchema = z.union([
  z
    .object({ data: z.array(z.unknown()) })
    .passthrough()
    .transform((o): SearchResult[] =>
      o.data.flatMap((item) => {
        const parsed = SearchResultItemSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  z.array(z.unknown()).transform((arr): SearchResult[] =>
    arr.flatMap((item) => {
      const parsed = SearchResultItemSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
]);

const DashcardParameterMappingSchema = z
  .object({
    parameter_id: z.string().optional(),
    card_id: z.number().nullable().optional(),
    target: z.unknown().optional(),
  })
  .passthrough();

const DashcardSchema = z
  .object({
    id: z.number(),
    card_id: z.number().nullable().optional(),
    dashboard_tab_id: z.number().nullable().optional(),
    parameter_mappings: z.array(DashcardParameterMappingSchema).nullable().optional(),
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
        parameterMappings: (dc.parameter_mappings ?? [])
          .filter((m): m is typeof m & { parameter_id: string } => m.parameter_id != null)
          .map((m) => ({ parameterId: m.parameter_id, target: m.target })),
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
