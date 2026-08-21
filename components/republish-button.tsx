"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function RepublishButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Queuing…" : "Republish PR comment"}</Button>;
}
