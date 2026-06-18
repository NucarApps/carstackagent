const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatDollars(n: number): string {
  return usd.format(n);
}

export function formatConfidence(c: number): string {
  return `${Math.round(c * 100)}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/** Render an evidence value (numbers as locale strings, everything else as-is). */
export function formatEvidence(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}
