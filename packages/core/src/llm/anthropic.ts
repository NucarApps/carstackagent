import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Defensive Anthropic wrapper. This is an integration boundary, so the request
 * is built as a plain object and the SDK call is laundered through a narrow
 * function type — that keeps us resilient to SDK version drift in the exact
 * param/response types while still using the official SDK. Per the API guidance:
 * model `claude-opus-4-8`, adaptive thinking, and structured output via
 * `output_config.format`.
 */

export interface LlmClientOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class LlmRefusalError extends Error {
  constructor(category: string | undefined) {
    super(`Claude refused the request${category ? ` (category: ${category})` : ""}`);
    this.name = "LlmRefusalError";
  }
}

/** Minimal shape of the response we read — robust to SDK minor changes. */
interface MinimalMessageResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string | null;
  stop_details?: { category?: string } | null;
}

export interface StructuredCall<T> {
  system: string;
  /** The pre-aggregated slice the model reasons over (serialized to JSON). */
  userPayload: unknown;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
}

export class LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: LlmClientOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? "claude-opus-4-8";
    this.maxTokens = opts.maxTokens ?? 16000;
  }

  /**
   * One synthesis call: adaptive thinking + structured JSON output, validated
   * against the caller's Zod schema. Throws LlmRefusalError on a safety refusal.
   */
  async synthesize<T>(call: StructuredCall<T>): Promise<T> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      thinking: { type: "adaptive" },
      system: call.system,
      messages: [
        { role: "user", content: JSON.stringify(call.userPayload) },
      ],
      output_config: {
        format: { type: "json_schema", schema: call.jsonSchema },
      },
    };

    // Launder the overloaded SDK signature through a narrow function type so we
    // are not coupled to the exact param/response type names of one SDK version.
    const create = this.client.messages.create.bind(
      this.client.messages,
    ) as unknown as (b: Record<string, unknown>) => Promise<MinimalMessageResponse>;

    const response = await create(body);

    if (response.stop_reason === "refusal") {
      throw new LlmRefusalError(response.stop_details?.category);
    }

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) {
      throw new Error("Claude returned no text content for structured output");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Claude returned non-JSON structured output: ${text.slice(0, 200)}`);
    }
    return call.schema.parse(parsed);
  }
}

export function createLlmClient(opts: LlmClientOptions): LlmClient {
  return new LlmClient(opts);
}
