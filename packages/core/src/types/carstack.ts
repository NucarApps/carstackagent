/**
 * TENTATIVE CarStack source shapes. These are guesses derived from CLAUDE.md —
 * NOT an authoritative spec. Everything is optional; the adapters tolerate
 * missing fields and preserve unknown ones into `payload`. See
 * docs/carstack_api_assumptions.md. When the real spec lands, correct these
 * plus carstack/adapters.ts and carstack/endpoints.ts — nothing else.
 */

/** A raw CarStack object is just an untyped record; adapters read it defensively. */
export type RawCarstackItem = Record<string, unknown>;

/** Shape of a paginated list response (param/field names are configurable). */
export interface CarstackListResponse {
  data?: RawCarstackItem[];
  items?: RawCarstackItem[];
  results?: RawCarstackItem[];
  page?: number;
  total?: number;
  has_more?: boolean;
  [key: string]: unknown;
}

export class ScopeNotEnabledError extends Error {
  readonly endpoint: string;
  readonly status = 403;
  constructor(endpoint: string) {
    super(
      `CarStack scope not enabled for endpoint "${endpoint}" (HTTP 403). ` +
        `This data will be absent for this run; not fatal.`,
    );
    this.name = "ScopeNotEnabledError";
    this.endpoint = endpoint;
  }
}

export class CarstackHttpError extends Error {
  readonly endpoint: string;
  readonly status: number;
  readonly body: string;
  constructor(endpoint: string, status: number, body: string) {
    super(`CarStack request to "${endpoint}" failed with HTTP ${status}`);
    this.name = "CarstackHttpError";
    this.endpoint = endpoint;
    this.status = status;
    this.body = body;
  }
}
