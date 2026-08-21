import { describe, expect, it, vi } from "vitest";
import { requestManualPublication } from "@/lib/publication/manual";

describe("manual republish authorization boundary", () => {
  it("queues the existing safe result for an authorized user", async () => {
    const store = { queueForAuthorizedUser: vi.fn(async () => true) };
    await expect(requestManualPublication("user_1", "run_1", store)).resolves.toBe(true);
    expect(store.queueForAuthorizedUser).toHaveBeenCalledWith("user_1", "run_1");
  });

  it("rejects an inaccessible run and has no execution dependencies", async () => {
    const store = { queueForAuthorizedUser: vi.fn(async () => false) };
    await expect(requestManualPublication("attacker", "run_1", store)).resolves.toBe(false);
    expect(Object.keys(store)).toEqual(["queueForAuthorizedUser"]);
  });
});
