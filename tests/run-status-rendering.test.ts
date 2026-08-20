import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunStatusBadge } from "@/components/run-status-badge";
import { StatusBadge } from "@/components/status-badge";

describe("dashboard hosted-run state rendering", () => {
  it.each([
    ["queued", "Queued"],
    ["running", "Running"],
    ["completed", "Completed"],
    ["failed", "Failed"],
    ["skipped", "Skipped"],
  ] as const)("renders %s with a textual label", (status, label) => {
    expect(renderToStaticMarkup(createElement(RunStatusBadge, { status }))).toContain(label);
  });

  it("renders verification separately from orchestration", () => {
    const markup = renderToStaticMarkup(createElement(StatusBadge, { status: "verified_after_retry" }));
    expect(markup).toContain("Verified after retry");
    expect(markup).not.toContain("Completed");
  });
});
