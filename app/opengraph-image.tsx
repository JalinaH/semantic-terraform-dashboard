import { ImageResponse } from "next/og";

export const alt = "TerraFix — verified Terraform failure intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0b0d11",
        color: "#f5f7fa",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          display: "flex",
          inset: 0,
          position: "absolute",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 960, position: "relative", width: "100%" }}>
        <div style={{ alignItems: "center", display: "flex", fontSize: 28, fontWeight: 700, gap: 16 }}>
          <div style={{ alignItems: "center", background: "#eef2f6", borderRadius: 14, color: "#111827", display: "flex", height: 58, justifyContent: "center", width: 58 }}>T</div>
          TerraFix
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 68, fontWeight: 700, letterSpacing: "-3px", lineHeight: 1.08, marginTop: 64 }}>
          <span>Diagnose failures.</span>
          <span style={{ color: "#98a2b3" }}>Verify the fix.</span>
        </div>
        <div style={{ color: "#a7b0be", fontSize: 25, marginTop: 34 }}>
          Terraform CI intelligence · isolated verification · human review
        </div>
      </div>
    </div>,
    size,
  );
}
