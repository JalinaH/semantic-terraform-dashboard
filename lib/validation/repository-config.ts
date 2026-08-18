import { z } from "zod";
import {
  CONTEXT_MODE_OPTIONS,
  FAILURE_STAGE_OPTIONS,
  MODEL_OPTIONS,
  MODEL_PROVIDER_OPTIONS,
} from "@/lib/repository-config/constants";

export const MAX_TERRAFORM_DIRECTORY_LENGTH = 240;
const TERRAFORM_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export function normalizeTerraformDirectory(value: string) {
  const normalized = value
    .trim()
    .replace(/\/{2,}/g, "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
  return normalized || ".";
}

const terraformDirectorySchema = z
  .string()
  .min(1, "Enter a Terraform directory.")
  .max(MAX_TERRAFORM_DIRECTORY_LENGTH, `Use ${MAX_TERRAFORM_DIRECTORY_LENGTH} characters or fewer.`)
  .superRefine((value, context) => {
    if (value.includes("\0") || /[\u0000-\u001F\u007F]/.test(value)) {
      context.addIssue({ code: "custom", message: "Control characters are not allowed." });
    }
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
      context.addIssue({ code: "custom", message: "Use a path relative to the repository root." });
    }
    if (value.includes("\\")) {
      context.addIssue({ code: "custom", message: "Use forward slashes in repository paths." });
    }
    const segments = value.split("/");
    if (segments.includes("..")) {
      context.addIssue({ code: "custom", message: "Parent-directory segments are not allowed." });
    }
    if (segments.some((segment) => segment && segment !== "." && !SAFE_PATH_SEGMENT_PATTERN.test(segment))) {
      context.addIssue({ code: "custom", message: "Use letters, numbers, dots, underscores, hyphens, and forward slashes only." });
    }
  })
  .transform(normalizeTerraformDirectory);

const formBooleanSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "on" || value === "1",
  z.boolean(),
);

export const repositoryConfigSchema = z
  .object({
    enabled: formBooleanSchema,
    terraformDir: terraformDirectorySchema,
    terraformVersion: z.string().regex(TERRAFORM_VERSION_PATTERN, "Use a Terraform version such as 1.15.7."),
    modelProvider: z.enum(MODEL_PROVIDER_OPTIONS),
    model: z.enum(MODEL_OPTIONS),
    contextMode: z.enum(CONTEXT_MODE_OPTIONS),
    maxRepairAttempts: z.coerce.number().int().min(0).max(1).transform((value) => value as 0 | 1),
    triggerOnPullRequest: formBooleanSchema,
    triggerOnPush: formBooleanSchema,
    failedStages: z.array(z.enum(FAILURE_STAGE_OPTIONS)).min(1, "Select at least one failed stage."),
  })
  .superRefine((value, context) => {
    if (value.modelProvider === "gemini" && value.model !== "gemini-3.6-flash") {
      context.addIssue({ code: "custom", path: ["model"], message: "Choose a model supported by the selected provider." });
    }
  });

export function repositoryConfigFormDataToValues(formData: FormData) {
  return {
    enabled: formData.get("enabled"),
    terraformDir: formData.get("terraformDir"),
    terraformVersion: formData.get("terraformVersion"),
    modelProvider: formData.get("modelProvider"),
    model: formData.get("model"),
    contextMode: formData.get("contextMode"),
    maxRepairAttempts: formData.get("maxRepairAttempts"),
    triggerOnPullRequest: formData.get("triggerOnPullRequest"),
    triggerOnPush: formData.get("triggerOnPush"),
    failedStages: formData.getAll("failedStages"),
  };
}

export function parseRepositoryConfigFormData(formData: FormData) {
  return repositoryConfigSchema.safeParse(repositoryConfigFormDataToValues(formData));
}
