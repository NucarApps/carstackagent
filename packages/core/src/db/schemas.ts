/** Postgres schema names used across the spine. */
export const SCHEMAS = {
  raw: "raw",
  core: "core",
  ext: "ext",
  rec: "rec",
  ref: "ref",
} as const;

export type SchemaName = (typeof SCHEMAS)[keyof typeof SCHEMAS];

/** Fully-qualified table/view names referenced from TypeScript. */
export const TABLES = {
  rawInventory: "raw.inventory_snapshot",
  rawVdp: "raw.vdp_enrichment_snapshot",
  rawRecon: "raw.recon_line_item",
  rawSalesMarket: "raw.sales_market_snapshot",
  rawRegistration: "raw.registration_snapshot",
  rawLead: "raw.lead_snapshot",
  rawDeal: "raw.deal_snapshot",
  rawAppointment: "raw.appointment_snapshot",
  rawIngestionRun: "raw.ingestion_run",
  refLocation: "ref.location",
  refRole: "ref.role",
  refRecommendationType: "ref.recommendation_type",
  recRecommendation: "rec.recommendation",
  recFeedback: "rec.recommendation_feedback",
  recWorklist: "rec.worklist",
  recCalibration: "rec.manager_calibration",
  recKnowledge: "rec.manager_knowledge",
  recLearningRun: "rec.learning_run",
} as const;
