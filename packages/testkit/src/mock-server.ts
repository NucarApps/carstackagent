import http from "node:http";
import type { FetchLike, FetchResponse } from "@dip/core";
import { getDataset, type LocationDataset } from "./dataset.js";

/**
 * Mock CarStack API. Exposes the same endpoints the client calls, with
 * pagination, per-VIN responses, and an optional forbidden-endpoint set that
 * returns 403 (to exercise the scope-not-enabled fail-soft path, Rule 2).
 *
 * `mockFetch` returns a FetchLike for injecting straight into CarstackClient in
 * tests (no sockets); `startMockServer` runs a real HTTP server for local dev.
 */

export interface MockOptions {
  /** Paths (e.g. "/registration") that should return HTTP 403. */
  forbidden?: string[];
  /** Require this bearer token if set. */
  apiKey?: string;
}

type ListKey = keyof Pick<
  LocationDataset,
  "inventory" | "salesMarket" | "registration" | "leads" | "deals" | "appointments"
>;

const LIST_PATHS: Record<string, ListKey> = {
  "/inventory": "inventory",
  "/sales-market": "salesMarket",
  "/registration": "registration",
  "/leads": "leads",
  "/deals": "deals",
  "/appointments": "appointments",
};

export interface MockResult {
  status: number;
  body: unknown;
}

/** Core request handler: maps (path, query) to a status + JSON body. */
export function handleMockRequest(
  path: string,
  query: URLSearchParams,
  options: MockOptions = {},
): MockResult {
  if (options.forbidden?.includes(path)) {
    return { status: 403, body: { error: "scope_not_enabled", path } };
  }

  const dataset = getDataset();
  const locationId = query.get("location_id") ?? undefined;

  // Per-VIN endpoints.
  if (path === "/vdp-enrichment" || path === "/recon") {
    const vin = query.get("vin");
    if (!vin || !locationId) return { status: 400, body: { error: "vin and location_id required" } };
    const ds = dataset.get(locationId);
    if (!ds) return { status: 200, body: { data: [] } };
    if (path === "/vdp-enrichment") {
      const item = ds.vdp.get(vin);
      return { status: 200, body: { data: item ? [item] : [] } };
    }
    const recon = ds.recon.get(vin);
    // Return the object with its line_items array (exercises fan-out).
    return { status: 200, body: recon ?? { vin, line_items: [] } };
  }

  // List endpoints with pagination.
  const key = LIST_PATHS[path];
  if (!key) return { status: 404, body: { error: "unknown endpoint", path } };

  const page = Math.max(1, Number(query.get("page") ?? "1"));
  const limit = Math.max(1, Number(query.get("limit") ?? "200"));

  const all: unknown[] = [];
  if (locationId) {
    const ds = dataset.get(locationId);
    if (ds) all.push(...ds[key]);
  } else {
    for (const ds of dataset.values()) all.push(...ds[key]);
  }
  const start = (page - 1) * limit;
  const slice = all.slice(start, start + limit);
  return { status: 200, body: { data: slice, page, total: all.length } };
}

function parseUrl(rawUrl: string): { path: string; query: URLSearchParams } {
  // The client builds <base>/api/v1/t/Nucar/<endpoint>?..., strip the prefix.
  const u = new URL(rawUrl, "http://mock.local");
  const idx = u.pathname.indexOf("/t/Nucar");
  const path = idx >= 0 ? u.pathname.slice(idx + "/t/Nucar".length) : u.pathname;
  return { path: path || "/", query: u.searchParams };
}

/** A FetchLike backed by the mock — inject directly into CarstackClient. */
export function mockFetch(options: MockOptions = {}): FetchLike {
  return async (url, init): Promise<FetchResponse> => {
    const auth = init.headers["Authorization"] ?? init.headers["authorization"];
    if (options.apiKey && auth !== `Bearer ${options.apiKey}`) {
      return jsonResponse(401, { error: "unauthorized" });
    }
    const { path, query } = parseUrl(url);
    const result = handleMockRequest(path, query, options);
    return jsonResponse(result.status, result.body);
  };
}

function jsonResponse(status: number, body: unknown): FetchResponse {
  const text = JSON.stringify(body);
  return { status, text: () => Promise.resolve(text) };
}

/** Run a real HTTP server (local dev / docker). */
export function startMockServer(
  port: number,
  options: MockOptions = {},
): http.Server {
  const server = http.createServer((req, res) => {
    const auth = req.headers["authorization"];
    if (options.apiKey && auth !== `Bearer ${options.apiKey}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const { path, query } = parseUrl(req.url ?? "/");
    const result = handleMockRequest(path, query, options);
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
  server.listen(port);
  return server;
}
