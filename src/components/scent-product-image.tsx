"use client";

import { useState } from "react";
import type { ScentPerfume } from "@/lib/scent-quest/scoring";
import { canUseCatalogProductImage } from "@/lib/scent-quest/catalog-image-url";
import { AromanEmblem } from "./aroman-emblem";

export function ScentProductImage({ perfume, className = "" }: { perfume: ScentPerfume; className?: string }) {
  const src = canUseCatalogProductImage(perfume.id, perfume.image) ? perfume.image : undefined;
  const imageKey = `${perfume.id}:${src ?? "fallback"}`;

  return <ScentProductImageState key={imageKey} perfume={perfume} className={className} src={src}/>;
}

function ScentProductImageState({ perfume, className, src }: { perfume: ScentPerfume; className: string; src?: string }) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return <div className={`sq-product-image ${className}`}>
      <img src={src} alt={`بطری عطر ${perfume.name} از ${perfume.brand}`} loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </div>;
  }

  return <div className={`sq-product-image sq-product-unavailable ${className}`}>
    <div className="sq-rec-fallback" role="img" aria-label={`نشان هویت رایحه آرومان؛ ${perfume.brand}`}>
      <span className="sq-fallback-brand">AROMAN</span>
      <AromanEmblem aria-hidden="true"/>
      <small>قصهٔ رایحه، به روایت آرومان</small>
    </div>
  </div>;
}
