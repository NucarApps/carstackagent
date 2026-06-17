/**
 * CarStack endpoint registry. ALL endpoint behavior is data here — when the real
 * API spec arrives, correcting paths, pagination params, the rate bucket, or the
 * response list key is a single-file edit. See docs/carstack_api_assumptions.md.
 */

export type RateBucket = "vdp" | "default";

export interface EndpointConfig {
  /** Path relative to CARSTACK_API_BASE. */
  path: string;
  /** Candidate keys under which the array of items is found in the response. */
  listKeys: string[];
  /** Per-VIN endpoints take a single vin and are not list-paginated. */
  perVin: boolean;
  /** Which throttle bucket governs this endpoint. */
  rateBucket: RateBucket;
  /** Whether to follow pagination. */
  paginated: boolean;
}

export type EndpointName =
  | "inventory"
  | "vdpEnrichment"
  | "recon"
  | "salesMarket"
  | "registration"
  | "leads"
  | "deals"
  | "appointments";

export const ENDPOINTS: Record<EndpointName, EndpointConfig> = {
  inventory: {
    path: "/inventory",
    listKeys: ["data", "items", "results", "inventory"],
    perVin: false,
    rateBucket: "default",
    paginated: true,
  },
  vdpEnrichment: {
    // Per-VIN, throttled to 240/min (Rule: ingestion build order).
    path: "/vdp-enrichment",
    listKeys: ["data", "items", "results"],
    perVin: true,
    rateBucket: "vdp",
    paginated: false,
  },
  recon: {
    // Per-VIN; the response carries an array of line items that we fan out.
    path: "/recon",
    listKeys: ["data", "items", "results", "line_items", "lineItems"],
    perVin: true,
    rateBucket: "default",
    paginated: false,
  },
  salesMarket: {
    // Make-level, PMA-scoped via API (Rule 2): no geo/segment/trim.
    path: "/sales-market",
    listKeys: ["data", "items", "results"],
    perVin: false,
    rateBucket: "default",
    paginated: true,
  },
  registration: {
    // Model-level, PMA-scoped via API (Rule 2/3): make/model/model_year.
    path: "/registration",
    listKeys: ["data", "items", "results"],
    perVin: false,
    rateBucket: "default",
    paginated: true,
  },
  leads: {
    path: "/leads",
    listKeys: ["data", "items", "results", "leads"],
    perVin: false,
    rateBucket: "default",
    paginated: true,
  },
  deals: {
    path: "/deals",
    listKeys: ["data", "items", "results", "deals"],
    perVin: false,
    rateBucket: "default",
    paginated: true,
  },
  appointments: {
    path: "/appointments",
    listKeys: ["data", "items", "results", "appointments"],
    perVin: false,
    rateBucket: "default",
    paginated: true,
  },
};
