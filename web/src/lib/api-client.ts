import { ApiError } from './api-error';
import { env } from './env';
import type { AuthTokens } from '@/types/api';

type TokenGetter = () => string | null;
type TokenSetter = (tokens: AuthTokens) => void;
type SessionExpiredHandler = () => void;

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the Authorization header (login, refresh, public careers page). */
  anonymous?: boolean;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
}

/**
 * Single HTTP entry point.
 *
 * Handles one thing the rest of the app should never think about: when the
 * access token expires mid-session, the first 401 triggers a refresh and every
 * concurrent request waits on that single refresh rather than stampeding the
 * endpoint and invalidating each other's rotated tokens.
 */
class ApiClient {
  private getAccessToken: TokenGetter = () => null;
  private getRefreshToken: TokenGetter = () => null;
  private onTokensRefreshed: TokenSetter = () => {};
  private onSessionExpired: SessionExpiredHandler = () => {};
  private refreshInFlight: Promise<string | null> | null = null;

  configure(handlers: {
    getAccessToken: TokenGetter;
    getRefreshToken: TokenGetter;
    onTokensRefreshed: TokenSetter;
    onSessionExpired: SessionExpiredHandler;
  }): void {
    this.getAccessToken = handlers.getAccessToken;
    this.getRefreshToken = handlers.getRefreshToken;
    this.onTokensRefreshed = handlers.onTokensRefreshed;
    this.onSessionExpired = handlers.onSessionExpired;
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  private async request<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const url = env.apiBaseUrl + path + buildQueryString(options.query);
    const response = await this.send(method, url, options);

    if (response.status === 401 && !options.anonymous) {
      const token = await this.refreshOnce();
      if (!token) {
        this.onSessionExpired();
        throw ApiError.fromBody(401, await safeJson(response));
      }
      const retried = await this.send(method, url, options);
      return this.parse<T>(retried);
    }

    return this.parse<T>(response);
  }

  private send(method: string, url: string, options: RequestOptions): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        body = options.body;
      } else {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }
    }

    if (!options.anonymous) {
      const token = this.getAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(url, { ...options, method, headers, body });
  }

  private async parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;

    if (!response.ok) {
      throw ApiError.fromBody(response.status, await safeJson(response));
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Collapses concurrent refresh attempts into a single in-flight request. */
  private refreshOnce(): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return Promise.resolve(null);

    this.refreshInFlight = (async () => {
      try {
        const response = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return null;

        const tokens = (await response.json()) as AuthTokens;
        this.onTokensRefreshed(tokens);
        return tokens.accessToken;
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }
}

function buildQueryString(
  query: RequestOptions['query'],
): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.clone().json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const api = new ApiClient();
