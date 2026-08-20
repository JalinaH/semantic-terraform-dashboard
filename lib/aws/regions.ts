export const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
] as const;

export const AWS_REGION_VALUES = AWS_REGIONS.map((region) => region.value) as [
  (typeof AWS_REGIONS)[number]["value"],
  ...(typeof AWS_REGIONS)[number]["value"][],
];

export type AwsRegion = (typeof AWS_REGION_VALUES)[number];
export const DEFAULT_AWS_REGION: AwsRegion = "ap-south-1";

export function getAwsRegionLabel(value: string) {
  return AWS_REGIONS.find((region) => region.value === value)?.label ?? value;
}
