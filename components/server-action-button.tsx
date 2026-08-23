"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function ServerActionButton({
  label,
  pendingLabel,
  variant = "default",
  size = "default",
  className,
}: {
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} size={size} className={className} disabled={pending} aria-disabled={pending}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}{pending ? pendingLabel : label}</Button>;
}
