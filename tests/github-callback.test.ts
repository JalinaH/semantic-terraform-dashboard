import { describe, expect, it } from "vitest";
import { parseInstallationCallbackParameters } from "@/lib/github/callback";

describe("installation callback parameters", () => {
  it("accepts an installation or update response", () => {
    expect(parseInstallationCallbackParameters(new URLSearchParams({ installation_id: "123", setup_action: "install" }))).toEqual({ installationId: "123", setupAction: "install" });
  });

  it.each([
    new URLSearchParams({ setup_action: "install" }),
    new URLSearchParams({ installation_id: "123", setup_action: "delete" }),
    new URLSearchParams({ installation_id: "123" }),
  ])("rejects missing or unexpected callback values", (params) => {
    expect(() => parseInstallationCallbackParameters(params)).toThrow();
  });
});
