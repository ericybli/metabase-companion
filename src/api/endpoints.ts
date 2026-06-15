import type { MetabaseClient } from './client';
import {
  CurrentUserSchema,
  DashboardDetailSchema,
  DashboardListSchema,
  QueryResultSchema,
  SessionPropertiesSchema,
  type CurrentUser,
  type DashboardDetail,
  type DashboardSummary,
  type QueryResult,
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
 */
export function runDashcardQuery(
  client: MetabaseClient,
  dashboardId: number,
  dashcardId: number,
  cardId: number,
): Promise<QueryResult> {
  return client.post(
    `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query`,
    { parameters: [] },
    QueryResultSchema,
  );
}

/**
 * POST /api/card/:cardId/query
 * Runs a standalone saved question query.
 */
export function runCardQuery(client: MetabaseClient, cardId: number): Promise<QueryResult> {
  return client.post(`/api/card/${cardId}/query`, {}, QueryResultSchema);
}
