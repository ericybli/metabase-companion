/**
 * Metadata about a saved Metabase instance.
 * Auth secrets (tokens, credentials) are NEVER stored here — those belong
 * exclusively in src/auth/secureStore.ts.
 */
export interface Instance {
  id: string;
  baseUrl: string;
  siteName: string;
  version: string;
}
