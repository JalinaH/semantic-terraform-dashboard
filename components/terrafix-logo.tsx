import Image from "next/image";
import { cn } from "@/lib/utils";

interface TerraFixLogoProps {
  className?: string;
  priority?: boolean;
  size?: number;
}

export function TerraFixLogo({ className, priority = false, size = 32 }: TerraFixLogoProps) {
  return (
    <Image
      src="/icon.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 rounded-[22%] object-cover", className)}
    />
  );
}
