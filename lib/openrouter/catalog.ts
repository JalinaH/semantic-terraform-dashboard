import { Prisma } from "@prisma/client";
import { z } from "zod";

const pricingSchema = z.object({ prompt: z.string().max(40).nullable().optional(), completion: z.string().max(40).nullable().optional() }).passthrough();
const modelSchema = z.object({
  id: z.string().min(1).max(200).regex(/^[A-Za-z0-9._:/-]+$/),
  canonical_slug: z.string().max(200).nullable().optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(10_000).nullable().optional(),
  context_length: z.number().int().positive().max(100_000_000).nullable().optional(),
  pricing: pricingSchema.nullable().optional(),
  supported_parameters: z.array(z.string().max(80)).max(100).default([]),
}).passthrough();
const responseSchema = z.object({ data: z.array(z.unknown()).max(2_000) }).passthrough();

export type NormalizedOpenRouterModel = {
  provider: "openrouter";
  modelId: string;
  canonicalSlug: string | null;
  displayName: string;
  description: string | null;
  contextLength: number | null;
  pricingPromptPerMillion: string | null;
  pricingOutputPerMillion: string | null;
  isFree: boolean | null;
  supportsStructuredOutput: boolean;
  supportsJsonFallback: boolean;
  upstreamProvider: string | null;
};

export class OpenRouterCatalogError extends Error {
  constructor(readonly code: "unavailable" | "authentication_failed" | "rate_limited" | "invalid_response", message: string) { super(message); this.name = "OpenRouterCatalogError"; }
}

export function normalizeOpenRouterCatalog(input: unknown) {
  const response = responseSchema.safeParse(input);
  if (!response.success) throw new OpenRouterCatalogError("invalid_response", "OpenRouter returned an invalid catalog document.");
  const models: NormalizedOpenRouterModel[] = [];
  let rejected = 0;
  const seen = new Set<string>();
  for (const value of response.data.data) {
    const parsed = modelSchema.safeParse(value);
    if (!parsed.success) { rejected += 1; continue; }
    if (seen.has(parsed.data.id)) throw new OpenRouterCatalogError("invalid_response", "OpenRouter returned duplicate model identifiers.");
    seen.add(parsed.data.id);
    const prompt = perMillion(parsed.data.pricing?.prompt);
    const output = perMillion(parsed.data.pricing?.completion);
    const parameters = new Set(parsed.data.supported_parameters);
    models.push({
      provider: "openrouter", modelId: parsed.data.id, canonicalSlug: bounded(parsed.data.canonical_slug, 200), displayName: bounded(parsed.data.name, 160)!,
      description: bounded(parsed.data.description, 1_000), contextLength: parsed.data.context_length ?? null,
      pricingPromptPerMillion: prompt, pricingOutputPerMillion: output,
      isFree: prompt === null || output === null ? null : new Prisma.Decimal(prompt).isZero() && new Prisma.Decimal(output).isZero(),
      supportsStructuredOutput: parameters.has("structured_outputs"), supportsJsonFallback: parameters.has("response_format"),
      upstreamProvider: parsed.data.id.includes("/") ? parsed.data.id.split("/", 1)[0].slice(0, 80) : null,
    });
  }
  return { received: response.data.data.length, rejected, models };
}

export async function fetchOpenRouterCatalog(options: { apiKey?: string; fetcher?: typeof fetch; signal?: AbortSignal } = {}) {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("https://openrouter.ai/api/v1/models", { headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}, signal: options.signal });
  } catch {
    throw new OpenRouterCatalogError("unavailable", "OpenRouter catalog request failed.");
  }
  if (response.status === 401 || response.status === 403) throw new OpenRouterCatalogError("authentication_failed", "OpenRouter rejected the catalog credential.");
  if (response.status === 429) throw new OpenRouterCatalogError("rate_limited", "OpenRouter rate limited the catalog request.");
  if (!response.ok) throw new OpenRouterCatalogError("unavailable", `OpenRouter catalog returned HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw new OpenRouterCatalogError("invalid_response", "OpenRouter catalog response exceeded the safe size limit.");
  try { return normalizeOpenRouterCatalog(JSON.parse(text)); } catch (error) { if (error instanceof OpenRouterCatalogError) throw error; throw new OpenRouterCatalogError("invalid_response", "OpenRouter returned malformed JSON."); }
}

function perMillion(value: string | null | undefined) {
  if (value === null || value === undefined || !/^\d+(?:\.\d+)?(?:e-?\d+)?$/i.test(value)) return null;
  try { const price = new Prisma.Decimal(value); return price.isNegative() ? null : price.mul(1_000_000).toFixed(); } catch { return null; }
}
function bounded(value: string | null | undefined, maximum: number) { return value ? value.slice(0, maximum) : null; }
