import { ChartNoAxesColumnIncreasing, LayoutDashboard, ListChecks, Settings, Waypoints } from "lucide-react";
import type { VerificationStage, VerificationStatus } from "@/lib/types";

export const APP_NAME = "TerraFix";
export const APP_SHORT_NAME = "TerraFix";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/repositories", label: "Repositories", icon: Waypoints },
  { href: "/runs", label: "Runs", icon: ListChecks },
  { href: "/usage", label: "Usage", icon: ChartNoAxesColumnIncreasing },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/repositories": "Repositories",
  "/runs": "Agent runs",
  "/usage": "AI usage",
  "/settings": "Settings",
};

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  verified_first_attempt: "Verified first attempt",
  verified_after_retry: "Verified after retry",
  locally_validated_first_attempt: "Locally validated",
  locally_validated_after_retry: "Locally validated after retry",
  verification_failed: "Verification failed",
  patch_rejected: "Patch rejected",
  verification_unavailable: "Verification unavailable",
  verification_skipped: "Verification skipped",
  pending: "Pending",
};

export const STAGE_LABELS: Record<VerificationStage, string> = {
  patch_check: "Patch check",
  patch_apply: "Patch apply",
  fmt: "Terraform fmt",
  init: "Terraform init",
  validate: "Terraform validate",
  plan: "Terraform plan",
};
