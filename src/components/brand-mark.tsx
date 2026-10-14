import Link from "next/link";

export function BrandMark() {
  return (
    <Link className="brand" href="/" aria-label="آرومان، صفحه اصلی">
      <span className="brand-emblem" aria-hidden="true">
        <svg viewBox="0 0 52 58" role="presentation">
          <path d="M26 1.8 49.6 15.4v27.2L26 56.2 2.4 42.6V15.4L26 1.8Z" />
          <path d="M26 10.2 42.3 19.6v18.8L26 47.8 9.7 38.4V19.6L26 10.2Z" />
          <path d="m17.6 34.8 8.4-19 8.4 19M20.7 28.1h10.6" />
        </svg>
      </span>
      <span className="brand-wordmark">
        <strong>AROMAN</strong>
        <small>آرومان</small>
      </span>
    </Link>
  );
}
