import { patchApplicationMessage } from "@/lib/patch-application/eligibility";
import type { PatchApplicationErrorCode } from "@/lib/patch-application/types";

export class PatchApplicationError extends Error {
  constructor(readonly code: PatchApplicationErrorCode, readonly terminalStatus: "STALE" | "REJECTED" | "FAILED" = "FAILED", options?: { cause?: unknown }) {
    super(patchApplicationMessage(code), options);
    this.name = "PatchApplicationError";
  }
}
