import { z } from "zod";
import {
  CONTEXT_MODE_OPTIONS,
  FAILURE_STAGE_OPTIONS,
  MODEL_PROVIDER_OPTIONS,
} from "@/lib/repository-config/constants";

export const MAX_TERRAFORM_DIRECTORY_LENGTH = 240;
const TERRAFORM_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const SAFE_WORKFLOW_PATTERN = /^[A-Za-z0-9 ._()\[\]*/?-]+$/;
const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]+$/;

function listSchema(label: string, options: { allowGlob?: boolean } = {}) {
  return z.array(z.string().trim().min(1).max(120)).max(12).superRefine((values, context) => {
    if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) {
      context.addIssue({ code: "custom", message: `${label} must not contain duplicates.` });
    }
    if (options.allowGlob && values.some((value) => !SAFE_WORKFLOW_PATTERN.test(value) || value.includes(".."))) {
      context.addIssue({ code: "custom", message: `${label} contain an unsupported pattern.` });
    }
  });
}

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
    model: z.string().trim().min(1).max(200).regex(MODEL_ID_PATTERN),
    modelRouting: z.enum(["auto", "fixed"]),
    maxModelTier: z.enum(["free", "economy", "balanced", "premium"]),
    fixedModelId: z.preprocess((value) => value === "" || value === undefined ? null : value, z.string().trim().min(1).max(200).regex(MODEL_ID_PATTERN).nullable()),
    modelPolicyVersion: z.enum(["terrafix_model_policy_v1", "legacy_phase8"]),
    contextMode: z.enum(CONTEXT_MODE_OPTIONS),
    maxRepairAttempts: z.coerce.number().int().min(0).max(1).transform((value) => value as 0 | 1),
    triggerOnPullRequest: formBooleanSchema,
    triggerOnPush: formBooleanSchema,
    failedStages: z.array(z.enum(FAILURE_STAGE_OPTIONS)).min(1, "Select at least one failed stage."),
    workflowNames: listSchema("Workflow names"),
    workflowNamePatterns: listSchema("Workflow name patterns", { allowGlob: true }),
    terraformPathPatterns: listSchema("Terraform path patterns", { allowGlob: true }).refine((values) => values.length > 0, "Add at least one Terraform path pattern."),
  })
  .superRefine((value, context) => {
    if (value.modelRouting === "auto" && value.fixedModelId !== null) context.addIssue({ code: "custom", path: ["fixedModelId"], message: "Auto Optimize cannot include a fixed model." });
    if (value.modelRouting === "fixed" && !value.fixedModelId) context.addIssue({ code: "custom", path: ["fixedModelId"], message: "Choose a model for fixed routing." });
    if (value.modelPolicyVersion === "terrafix_model_policy_v1" && value.modelProvider !== "openrouter") context.addIssue({ code: "custom", path: ["modelProvider"], message: "TerraFix model policy uses the hosted OpenRouter gateway." });
    if (value.workflowNames.length === 0 && value.workflowNamePatterns.length === 0) {
      context.addIssue({ code: "custom", path: ["workflowNames"], message: "Add at least one workflow name or pattern." });
    }
  });

export function repositoryConfigFormDataToValues(formData: FormData) {
  return {
    enabled: formData.get("enabled"),
    terraformDir: formData.get("terraformDir"),
    terraformVersion: formData.get("terraformVersion"),
    modelProvider: formData.get("modelProvider"),
    model: formData.get("model"),
    modelRouting: formData.get("modelRouting"),
    maxModelTier: formData.get("maxModelTier"),
    fixedModelId: formData.get("fixedModelId"),
    modelPolicyVersion: formData.get("modelPolicyVersion"),
    contextMode: formData.get("contextMode"),
    maxRepairAttempts: formData.get("maxRepairAttempts"),
    triggerOnPullRequest: formData.get("triggerOnPullRequest"),
    triggerOnPush: formData.get("triggerOnPush"),
    failedStages: formData.getAll("failedStages"),
    workflowNames: splitList(formData.get("workflowNames")),
    workflowNamePatterns: splitList(formData.get("workflowNamePatterns")),
    terraformPathPatterns: splitList(formData.get("terraformPathPatterns")),
  };
}

function splitList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export function parseRepositoryConfigFormData(formData: FormData) {
  return repositoryConfigSchema.safeParse(repositoryConfigFormDataToValues(formData));
}
