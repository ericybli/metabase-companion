import { z } from 'zod';
import type { MetabaseClient } from './client';
import {
  CardDetailSchema,
  CurrentUserSchema,
  DashboardDetailSchema,
  DashboardListSchema,
  QueryResultSchema,
  SessionPropertiesSchema,
  type CardDetail,
  type CurrentUser,
  type DashboardDetail,
  type DashboardSummary,
  type QueryResult,
  type SessionProperties,
} from './schemas';

/**
 * Defensive shape for POST .../params/:paramId/values. Metabase returns
 * `{ values: [[value, ...], ...] }` (each inner array's first element is the
 * actual value). Tolerates extra keys and a missing/empty list.
 */
const ParameterValuesSchema = z
  .object({ values: z.array(z.array(z.unknown())).optional() })
  .passthrough()
  .transform((raw): string[] => (raw.values ?? []).map((v) => String(v[0])));

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

/** GET /api/dashboard — dashboards the current user can see. */
export function listDashboards(client: MetabaseClient): Promise<DashboardSummary[]> {
  return client.get('/api/dashboard', DashboardListSchema);
}

/** GET /api/dashboard/:id — a dashboard with its (non-virtual) cards. */
export function getDashboard(client: MetabaseClient, id: number): Promise<DashboardDetail> {
  return client.get(`/api/dashboard/${id}`, DashboardDetailSchema);
}

/**
 * POST /api/dashboard/:dashboardId/dashcard/:dashcardId/card/:cardId/query
 * Runs a dashboard card query with dashboard context (applies dashboard filters).
 * Pass `parameters` to forward active dashboard filter values (default values, etc.).
 */
export function runDashcardQuery(
  client: MetabaseClient,
  dashboardId: number,
  dashcardId: number,
  cardId: number,
  parameters: { id: string; value: unknown }[] = [],
): Promise<QueryResult> {
  return client.post(
    `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query`,
    { parameters },
    QueryResultSchema,
  );
}

/** GET /api/card/:id — a standalone saved question (display, viz settings, name). */
export function getCard(client: MetabaseClient, id: number): Promise<CardDetail> {
  return client.get(`/api/card/${id}`, CardDetailSchema);
}

/**
 * POST /api/card/:cardId/query
 * Runs a standalone saved question query.
 */
export function runCardQuery(client: MetabaseClient, cardId: number): Promise<QueryResult> {
  return client.post(`/api/card/${cardId}/query`, {}, QueryResultSchema);
}

/**
 * POST /api/dashboard/:dashboardId/params/:paramId/values
 * Fetches the selectable values for a field/card-backed dashboard parameter
 * (used to populate a dropdown). Returns each value's first element as a string.
 */
export function getParameterValues(
  client: MetabaseClient,
  dashboardId: number,
  paramId: string,
): Promise<string[]> {
  return client.post(
    `/api/dashboard/${dashboardId}/params/${paramId}/values`,
    {},
    ParameterValuesSchema,
  );
}
