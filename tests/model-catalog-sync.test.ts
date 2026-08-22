import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), catalogUpsert: vi.fn(), catalogUpdateMany: vi.fn(), syncUpsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction, modelCatalogSync: { upsert: mocks.syncUpsert } } }));

import { syncOpenRouterCatalog } from "@/lib/model-policy/catalog";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncUpsert.mockResolvedValue({});
  mocks.catalogUpsert.mockResolvedValue({});
  mocks.catalogUpdateMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback: (client: unknown) => Promise<void>) => callback({ modelCatalogEntry: { upsert: mocks.catalogUpsert, updateMany: mocks.catalogUpdateMany }, modelCatalogSync: { upsert: mocks.syncUpsert } }));
});

describe("OpenRouter catalog synchronization", () => {
  it("normalizes the whole response before applying an atomic catalog update", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "openrouter/free", name: "OpenRouter Free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["response_format"] }] }), { status: 200 }));
    await expect(syncOpenRouterCatalog({ fetcher, now: new Date("2026-08-23T00:00:00.000Z") })).resolves.toMatchObject({ received: 1, normalized: 1, enabled: 1, free: 1 });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.catalogUpsert).toHaveBeenCalledOnce();
    expect(mocks.catalogUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ available: false }) }));
  });

  it("preserves last-known-good model rows when fetching or validation fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
    await expect(syncOpenRouterCatalog({ fetcher })).rejects.toMatchObject({ code: "invalid_response" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.catalogUpsert).not.toHaveBeenCalled();
    expect(mocks.syncUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ lastErrorCode: "invalid_response" }) }));
  });

  it.each([[401, "authentication_failed"], [429, "rate_limited"], [503, "unavailable"]] as const)("records safe HTTP %s failures", async (status, code) => {
    await expect(syncOpenRouterCatalog({ fetcher: vi.fn().mockResolvedValue(new Response("", { status })) })).rejects.toMatchObject({ code });
    expect(mocks.catalogUpsert).not.toHaveBeenCalled();
  });
});
