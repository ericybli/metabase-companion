import type { ZodType } from 'zod';
import { ApiException, type ApiError } from './errors';

export interface MetabaseClientOptions {
  baseUrl: string; // already normalized
  getToken: () => string | null; // current session token or null
  onUnauthorized?: () => Promise<string | null>; // re-auth hook; returns NEW token or null. Called at most once per request.
}

export class MetabaseClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized?: () => Promise<string | null>;

  constructor(opts: MetabaseClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.getToken = opts.getToken;
    this.onUnauthorized = opts.onUnauthorized;
  }

  async get<T>(path: string, schema: ZodType<T>): Promise<T> {
    const res = await this.request('GET', path, undefined);
    return this.parseBody(res, schema);
  }

  async post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
    const res = await this.request('POST', path, body);
    return this.parseBody(res, schema);
  }

  async del(path: string): Promise<void> {
    await this.request('DELETE', path, undefined);
  }

  /**
   * Performs the HTTP request, mapping status codes to ApiException and
   * implementing the 401 -> onUnauthorized -> retry-once flow.
   * Returns the raw Response for successful (2xx) requests.
   */
  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    token: string | null = this.getToken(),
    isRetry = false,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) {
      headers['X-Metabase-Session'] = token;
    }

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, init);
    } catch (e) {
      throw new ApiException({
        kind: 'network',
        message: e instanceof Error ? e.message : 'Network request failed',
      });
    }

    if (res.ok) {
      return res;
    }

    if (res.status === 401) {
      if (!isRetry && this.onUnauthorized) {
        const fresh = await this.onUnauthorized();
        if (fresh) {
          return this.request(method, path, body, fresh, true);
        }
      }
      throw new ApiException({ kind: 'unauthorized' });
    }

    throw new ApiException(await this.mapErrorStatus(res));
  }

  private async mapErrorStatus(res: Response): Promise<ApiError> {
    if (res.status === 403) return { kind: 'forbidden' };
    if (res.status === 404) return { kind: 'notFound' };
    // 4xx (other) and 5xx -> server
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (
        data &&
        typeof data === 'object' &&
        typeof (data as { message?: unknown }).message === 'string'
      ) {
        message = (data as { message: string }).message;
      }
    } catch {
      // body not JSON; keep the default message
    }
    return { kind: 'server', status: res.status, message };
  }

  private async parseBody<T>(res: Response, schema: ZodType<T>): Promise<T> {
    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      throw new ApiException({
        kind: 'parse',
        message: e instanceof Error ? e.message : 'Failed to parse JSON',
      });
    }
    const result = schema.safeParse(json);
    if (!result.success) {
      throw new ApiException({ kind: 'parse', message: result.error.message });
    }
    return result.data;
  }
}
