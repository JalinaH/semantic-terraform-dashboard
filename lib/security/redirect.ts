const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function validateInternalRedirect(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || CONTROL_CHARACTERS.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;

  try {
    const parsed = new URL(value, "http://internal.local");
    if (parsed.origin !== "http://internal.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
