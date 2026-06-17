import {
  CarstackHttpError,
  ScopeNotEnabledError,
  type RawCarstackItem,
} from "../types/carstack.js";
import { ENDPOINTS, type EndpointName } from "./endpoints.js";
import { TokenBucket } from "./throttle.js";

/** Minimal HTTP response shape — lets us inject a fake fetch in tests. */
export interface FetchResponse {
  status: number;
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<FetchResponse>;

export interface CarstackClientConfig {
  base: string;
  apiKey: string;
  pageSizeMax: number;
  vdpRatePerMin: number;
  /** Looser bucket for non-VDP endpoints. */
  defaultRatePerMin?: number;
  maxRetries?: number;
  fetchImpl?: FetchLike;
  sleepFn?: (ms: number) => Promise<void>;
}

const defaultFetch: FetchLike = (url, init) =>
  fetch(url, init) as unknown as Promise<FetchResponse>;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Defensive CarStack client. Handles auth, pagination (cap PAGE_SIZE_MAX, follow
 * until a short page), per-endpoint throttling, retry/backoff on 429/5xx, and
 * maps 403 to a non-fatal ScopeNotEnabledError (Rule 2 / build order).
 */
export class CarstackClient {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly pageSizeMax: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly buckets: { vdp: TokenBucket; default: TokenBucket };

  constructor(config: CarstackClientConfig) {
    this.base = config.base.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.pageSizeMax = config.pageSizeMax;
    this.maxRetries = config.maxRetries ?? 4;
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
    this.sleepFn = config.sleepFn ?? sleep;
    this.buckets = {
      vdp: new TokenBucket(config.vdpRatePerMin, config.vdpRatePerMin, this.sleepFn),
      default: new TokenBucket(
        config.defaultRatePerMin ?? 600,
        config.defaultRatePerMin ?? 600,
        this.sleepFn,
      ),
    };
  }

  /** Paginated list for a non-per-VIN endpoint. */
  async list(
    endpoint: Exclude<EndpointName, "vdpEnrichment" | "recon">,
    params: Record<string, string | number> = {},
  ): Promise<RawCarstackItem[]> {
    const cfg = ENDPOINTS[endpoint];
    const all: RawCarstackItem[] = [];
    let page = 1;
    const maxPages = 5_000;
    for (; page <= maxPages; page++) {
      const query = {
        ...params,
        page,
        limit: this.pageSizeMax,
      };
      const parsed = await this.requestJson(endpoint, cfg.path, query);
      const items = extractList(parsed, cfg.listKeys, false);
      all.push(...items);
      if (!cfg.paginated || items.length < this.pageSizeMax) break;
    }
    return all;
  }

  /** Single fetch for a per-VIN endpoint (vdp-enrichment, recon). */
  async getForVin(
    endpoint: Extract<EndpointName, "vdpEnrichment" | "recon">,
    locationId: string,
    vin: string,
    params: Record<string, string | number> = {},
  ): Promise<RawCarstackItem[]> {
    const cfg = ENDPOINTS[endpoint];
    const parsed = await this.requestJson(endpoint, cfg.path, {
      ...params,
      location_id: locationId,
      vin,
    });
    return extractList(parsed, cfg.listKeys, true);
  }

  private async requestJson(
    endpoint: EndpointName,
    path: string,
    query: Record<string, string | number>,
  ): Promise<unknown> {
    const bucket = this.buckets[ENDPOINTS[endpoint].rateBucket];
    const url = this.buildUrl(path, query);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await bucket.acquire();
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (res.status === 403) {
        // Scope not enabled on this key — non-fatal, surfaced to the caller.
        throw new ScopeNotEnabledError(path);
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new CarstackHttpError(path, res.status, await safeText(res));
        await this.sleepFn(backoffMs(attempt));
        continue;
      }
      if (res.status >= 400) {
        throw new CarstackHttpError(path, res.status, await safeText(res));
      }
      const body = await res.text();
      return body ? JSON.parse(body) : {};
    }
    throw lastErr ??
      new CarstackHttpError(path, 0, "exhausted retries with no response");
  }

  private buildUrl(path: string, query: Record<string, string | number>): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) qs.set(k, String(v));
    const sep = qs.toString() ? `?${qs.toString()}` : "";
    return `${this.base}${path}${sep}`;
  }
}

function backoffMs(attempt: number): number {
  // 250ms, 500ms, 1s, 2s, ... with a little jitter.
  return Math.min(250 * 2 ** attempt, 8_000) + Math.floor(Math.random() * 100);
}

async function safeText(res: FetchResponse): Promise<string> {
  try {
    return (await res.text()).slice(0, 1_000);
  } catch {
    return "";
  }
}

/**
 * Pull the array of items out of a response that may be an array, an object
 * with one of several list keys, or (for per-VIN endpoints) a single object.
 */
export function extractList(
  parsed: unknown,
  listKeys: string[],
  wrapSingle: boolean,
): RawCarstackItem[] {
  if (Array.isArray(parsed)) return parsed as RawCarstackItem[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of listKeys) {
      const v = obj[key];
      if (Array.isArray(v)) return v as RawCarstackItem[];
    }
    if (wrapSingle) return [obj as RawCarstackItem];
  }
  return [];
}
