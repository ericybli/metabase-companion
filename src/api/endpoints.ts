import type { MetabaseClient } from './client';
import {
  CurrentUserSchema,
  DashboardDetailSchema,
  DashboardListSchema,
  SessionPropertiesSchema,
  type CurrentUser,
  type DashboardDetail,
  type DashboardSummary,
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
