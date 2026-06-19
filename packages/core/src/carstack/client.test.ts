import { describe, expect, it } from "vitest";
import { CarstackClient, extractList, type FetchLike } from "./client.js";
import { ScopeNotEnabledError } from "../types/carstack.js";

describe("extractList", () => {
  it("finds the array under common list keys, or wraps a single object", () => {
    expect(extractList({ data: [{ a: 1 }] }, ["data"], false)).toEqual([{ a: 1 }]);
    expect(extractList([{ a: 1 }], ["data"], false)).toEqual([{ a: 1 }]);
    expect(extractList({ vin: "X", line_items: [{ id: 1 }] }, ["line_items"], true)).toEqual([{ id: 1 }]);
    expect(extractList({ vin: "X" }, ["data"], true)).toEqual([{ vin: "X" }]);
    expect(extractList({ vin: "X" }, ["data"], false)).toEqual([]);
  });
});

describe("CarstackClient", () => {
  function client(fetchImpl: FetchLike): CarstackClient {
    return new CarstackClient({
      base: "https://carstack.io/api/v1/t/Nucar",
      apiKey: "k",
      pageSizeMax: 200,
      vdpRatePerMin: 1_000_000,
      defaultRatePerMin: 1_000_000,
      fetchImpl,
      sleepFn: () => Promise.resolve(),
    });
  }

  it("follows pagination until a short page", async () => {
    const total = 450;
    const fetchImpl: FetchLike = (url) => {
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      const limit = 200;
      const start = (page - 1) * limit;
      const data = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({
        vin: `V${start + i}`,
      }));
      return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify({ data })) });
    };
    const items = await client(fetchImpl).list("inventory", { location_id: "NUCAR-01" });
    expect(items).toHaveLength(450); // 200 + 200 + 50
  });

  it("maps 403 to a non-fatal ScopeNotEnabledError", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve({ status: 403, text: () => Promise.resolve("{}") });
    await expect(client(fetchImpl).list("registration", { location_id: "X" })).rejects.toBeInstanceOf(
      ScopeNotEnabledError,
    );
  });
});
