import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGitHubAppJwt, inspectAppJwt } from "@/lib/github/app";

describe("GitHub App JWT", () => {
  it("creates a short-lived RS256 app token without external services", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const now = new Date("2026-08-18T10:00:00.000Z");
    const token = await createGitHubAppJwt({ issuer: "Iv1.client-id", privateKey: pem, now });
    const inspected = inspectAppJwt(token);

    expect(inspected.algorithm).toBe("RS256");
    expect(inspected.issuer).toBe("Iv1.client-id");
    expect(inspected.issuedAt).toBe(Math.floor(now.getTime() / 1000) - 60);
    expect((inspected.expiresAt ?? 0) - (inspected.issuedAt ?? 0)).toBe(9 * 60);
  });
});
