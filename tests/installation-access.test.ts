import { describe, expect, it } from "vitest";
import { assertInstallationIdentity, installationIsAccessible } from "@/lib/github/user-access";

const installations = [
  { id: 101, account: { id: 1, login: "personal" } },
  { id: 202, account: { id: 2, login: "platform-org" } },
];

describe("installation ownership and access", () => {
  it("supports multiple accessible installations", () => {
    expect(installationIsAccessible(installations, "101")).toBe(true);
    expect(installationIsAccessible(installations, "202")).toBe(true);
    expect(installationIsAccessible(installations, "303")).toBe(false);
  });

  it("requires the user-visible and app-authenticated account identities to agree", () => {
    expect(() => assertInstallationIdentity(installations[1], { installationId: "202", accountId: "2" })).not.toThrow();
    expect(() => assertInstallationIdentity(installations[1], { installationId: "202", accountId: "99" })).toThrow();
    expect(() => assertInstallationIdentity(installations[1], { installationId: "101", accountId: "2" })).toThrow();
  });
});
