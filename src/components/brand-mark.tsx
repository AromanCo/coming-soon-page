import Link from "next/link";
import { AromanEmblem } from "./aroman-emblem";

type BrandMarkProps = {
  compact?: boolean;
  linked?: boolean;
};

function Mark({ compact }: Pick<BrandMarkProps, "compact">) {
  return (
    <span className={compact ? "brand compact" : "brand"}>
      <span className="brand-emblem" aria-hidden="true">
        <AromanEmblem />
      </span>
      <span className="brand-wordmark">
        <strong dir="ltr" lang="en">AROMAN</strong>
      </span>
    </span>
  );
}

export function BrandMark({ compact = false, linked = true }: BrandMarkProps) {
  if (!linked) {
    return (
      <span aria-label="آرومان">
        <Mark compact={compact} />
      </span>
    );
  }

  return (
    <Link className="brand-link" href="/" aria-label="آرومان، صفحه اصلی">
      <Mark compact={compact} />
    </Link>
  );
}
