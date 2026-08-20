import { describe, expect, it } from "vitest";
import { awsRegionSchema, iamRoleArnSchema, parseIamRoleArn } from "@/lib/validation/aws-connection";

describe("AWS onboarding validation", () => {
  it("accepts a valid IAM role ARN", () => {
    const arn = "arn:aws:iam::123456789012:role/team/SemanticTerraformRole";
    expect(iamRoleArnSchema.parse(arn)).toBe(arn);
    expect(parseIamRoleArn(arn)).toMatchObject({ accountId: "123456789012", roleName: "SemanticTerraformRole" });
  });

  it.each([
    "arn:aws:iam::123456789012:user/alice",
    "arn:aws:iam::123456789012:policy/verification",
    "arn:aws:sts::123456789012:assumed-role/Role/session",
    "not-an-arn",
    "arn:aws:iam::123:role/Role",
  ])("rejects non-role or malformed ARNs: %s", (value) => {
    expect(iamRoleArnSchema.safeParse(value).success).toBe(false);
  });

  it("accepts only the curated Phase 4 region list", () => {
    expect(awsRegionSchema.parse("ap-south-1")).toBe("ap-south-1");
    expect(awsRegionSchema.parse("ap-southeast-1")).toBe("ap-southeast-1");
    expect(awsRegionSchema.safeParse("moon-east-1").success).toBe(false);
  });
});
