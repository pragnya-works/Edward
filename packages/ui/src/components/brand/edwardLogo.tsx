import Image from "next/image";
import { cn } from "@edward/ui/lib/utils";

interface EdwardLogoProps {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
  quality?: number;
  sizes?: string;
}

export const EDWARD_LOGO_URL =
  "https://assets.pragnyaa.in/home/favicon_io/android-chrome-512x512.png";

export function EdwardLogo({
  size = 24,
  className,
  alt = "Edward logo",
  priority = false,
  quality = 72,
  sizes,
}: EdwardLogoProps) {
  return (
    <Image
      src={EDWARD_LOGO_URL}
      alt={alt}
      width={size}
      height={size}
      sizes={sizes ?? `${size}px`}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      quality={quality}
      decoding="async"
      className={cn("shrink-0 rounded-lg object-cover", className)}
    />
  );
}
