import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
  linked?: boolean;
};

function Mark({ compact }: Pick<BrandMarkProps, "compact">) {
  return (
    <span className={compact ? "brand compact" : "brand"}>
      <span className="brand-emblem" aria-hidden="true">
        <svg viewBox="0 0 52 58" role="presentation">
          <path d="M26 1.8 49.6 15.4v27.2L26 56.2 2.4 42.6V15.4L26 1.8Z" />
          <path d="M26 10.2 42.3 19.6v18.8L26 47.8 9.7 38.4V19.6L26 10.2Z" />
          <path d="m17.6 34.8 8.4-19 8.4 19M20.7 28.1h10.6" />
        </svg>
      </span>
      <span className="brand-wordmark">
        <strong dir="ltr" lang="en">AROMAN</strong>
        <small>آرومان</small>
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
