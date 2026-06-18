import type { RawCarstackItem } from "@dip/core";

/**
 * Deterministic mock CarStack dataset. Shapes mirror the TENTATIVE assumptions
 * in docs/carstack_api_assumptions.md. The inventory size for the first store
 * deliberately exceeds the 200/page cap to exercise pagination; recon items
 * carry a `line_items` array to exercise the fan-out.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODELS: Array<[string, string]> = [
  ["Toyota", "RAV4"], ["Toyota", "Camry"], ["Toyota", "Tacoma"],
  ["Honda", "CR-V"], ["Honda", "Civic"], ["Honda", "Accord"],
  ["Ford", "F-150"], ["Ford", "Explorer"],
  ["Chevrolet", "Silverado"], ["Chevrolet", "Equinox"],
  ["Subaru", "Outback"], ["Subaru", "Forester"],
  ["Nissan", "Rogue"], ["Nissan", "Altima"],
];

const FIRST_NAMES = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "David", "Susan", "Maria", "Carlos"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
const CITIES: Array<[string, string]> = [
  ["Wilmington", "DE"], ["New Castle", "DE"], ["Newark", "DE"],
  ["Philadelphia", "PA"], ["Elkton", "MD"],
];

export interface LocationDataset {
  inventory: RawCarstackItem[];
  vdp: Map<string, RawCarstackItem>;
  recon: Map<string, RawCarstackItem>;
  salesMarket: RawCarstackItem[];
  registration: RawCarstackItem[];
  leads: RawCarstackItem[];
  deals: RawCarstackItem[];
  appointments: RawCarstackItem[];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildLocation(locationId: string, invCount: number, seed: number): LocationDataset {
  const rnd = mulberry32(seed);
  const inventory: RawCarstackItem[] = [];
  const vdp = new Map<string, RawCarstackItem>();
  const recon = new Map<string, RawCarstackItem>();

  for (let i = 0; i < invCount; i++) {
    const vin = `${locationId}-VIN${String(i).padStart(4, "0")}`;
    const [make, model] = MODELS[Math.floor(rnd() * MODELS.length)]!;
    const modelYear = 2019 + Math.floor(rnd() * 6);
    const ageDays = Math.floor(rnd() * 130); // 0..129 days on lot
    const unpriced = rnd() < 0.08;
    const basePrice = 18000 + Math.floor(rnd() * 32000);
    inventory.push({
      vin,
      stock_number: `STK${i}`,
      make,
      model,
      model_year: modelYear,
      mileage: 5000 + Math.floor(rnd() * 80000),
      list_price: unpriced ? 0 : basePrice,
      cost: Math.round(basePrice * 0.9),
      status: "available",
      condition: rnd() < 0.3 ? "new" : "used",
      first_seen: isoDaysAgo(ageDays),
    });
    vdp.set(vin, {
      vin,
      vdp_views: Math.floor(rnd() * 400),
      photo_count: Math.floor(rnd() * 30),
      price_changed: rnd() < 0.2,
    });
    const reconCount = Math.floor(rnd() * 3);
    const lineItems = Array.from({ length: reconCount }, (_, k) => ({
      id: `${vin}-recon-${k}`,
      description: ["Detail", "Brakes", "Tires", "Inspection"][Math.floor(rnd() * 4)],
      cost: 50 + Math.floor(rnd() * 800),
      status: rnd() < 0.5 ? "complete" : "pending",
    }));
    recon.set(vin, { vin, line_items: lineItems });
  }

  // Make-level sales-market (API path: no geo/segment/trim).
  const makes = [...new Set(MODELS.map(([m]) => m))];
  const salesMarket: RawCarstackItem[] = makes.map((make) => ({
    make,
    units: 50 + Math.floor(rnd() * 150),
    share: Math.round(rnd() * 100) / 100,
  }));

  // Model-level registration (API path: make/model/model_year).
  const registration: RawCarstackItem[] = MODELS.flatMap(([make, model]) =>
    [2022, 2023].map((year) => ({
      make,
      model,
      model_year: year,
      units: 10 + Math.floor(rnd() * 90),
    })),
  );

  // Customers: some leads share a name with a deal (journey), most do not.
  const customer = (n: number): { name: string; city: string; state: string } => {
    const fn = FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)]!;
    const ln = LAST_NAMES[(n + Math.floor(rnd() * LAST_NAMES.length)) % LAST_NAMES.length]!;
    const [city, state] = CITIES[Math.floor(rnd() * CITIES.length)]!;
    return { name: `${fn} ${ln}`, city, state };
  };

  const deals: RawCarstackItem[] = [];
  for (let i = 0; i < 20; i++) {
    const c = customer(i);
    const inv = inventory[Math.floor(rnd() * inventory.length)]!;
    deals.push({
      id: `${locationId}-DEAL${i}`,
      customer_name: c.name,
      city: c.city,
      state: c.state,
      vin: inv["vin"] as string,
      sold_date: isoDaysAgo(Math.floor(rnd() * 90)),
    });
  }

  const leads: RawCarstackItem[] = [];
  for (let i = 0; i < 35; i++) {
    // ~30% of leads reuse a deal customer (converted); the rest are open.
    let cust: { name: string; city: string; state: string };
    if (rnd() < 0.3 && deals.length > 0) {
      const d = deals[Math.floor(rnd() * deals.length)]!;
      cust = { name: String(d["customer_name"]), city: String(d["city"]), state: String(d["state"]) };
    } else {
      cust = customer(1000 + i);
    }
    const [make, model] = MODELS[Math.floor(rnd() * MODELS.length)]!;
    leads.push({
      id: `${locationId}-LEAD${i}`,
      customer_name: cust.name,
      city: cust.city,
      state: cust.state,
      source: ["web", "phone", "walk-in", "thirdparty"][Math.floor(rnd() * 4)],
      status: "new",
      make,
      model,
      created_at: isoDaysAgo(Math.floor(rnd() * 12)),
    });
  }

  const appointments: RawCarstackItem[] = [];
  for (let i = 0; i < 15; i++) {
    const c = customer(2000 + i);
    appointments.push({
      id: `${locationId}-APPT${i}`,
      customer_name: c.name,
      city: c.city,
      state: c.state,
      appt_date: isoDaysAgo(Math.floor(rnd() * 20) - 5),
    });
  }

  return { inventory, vdp, recon, salesMarket, registration, leads, deals, appointments };
}

let cache: Map<string, LocationDataset> | undefined;

/** The mock dataset, keyed by location_id. First store exceeds 200 vehicles. */
export function getDataset(): Map<string, LocationDataset> {
  if (!cache) {
    cache = new Map([
      ["NUCAR-01", buildLocation("NUCAR-01", 250, 101)],
      ["NUCAR-02", buildLocation("NUCAR-02", 60, 202)],
    ]);
  }
  return cache;
}

export const MOCK_LOCATION_IDS = ["NUCAR-01", "NUCAR-02"] as const;
