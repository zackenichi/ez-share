"use client";

import Image from "next/image";
import { Layers3 } from "lucide-react";
import { useState } from "react";

type AppLogoProps = {
  name: string;
  src?: string;
};

export function AppLogo({ name, src }: AppLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!src || imageFailed) {
    return (
      <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_color-mix(in_oklch,var(--primary),transparent_35%)]">
        <Layers3 className="size-5" strokeWidth={2.25} aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={`${name} logo`}
      width={40}
      height={40}
      className="size-10 object-contain"
      priority
      onError={() => setImageFailed(true)}
    />
  );
}
