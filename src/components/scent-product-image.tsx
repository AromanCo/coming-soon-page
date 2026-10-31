"use client";

import { useState } from "react";
import type { ScentPerfume } from "@/lib/scent-quest/scoring";
import { scentQuestProductImages } from "@/lib/scent-quest/product-image-map";
import { AromanEmblem } from "./aroman-emblem";

export function ScentProductImage({ perfume, className = "" }: { perfume: ScentPerfume; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = scentQuestProductImages[perfume.id];

  if (src && !failed) {
    return <div className={`sq-product-image ${className}`}>
      <img src={src} alt={`بطری عطر ${perfume.name} از ${perfume.brand}`} loading="lazy" onError={() => setFailed(true)} />
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
