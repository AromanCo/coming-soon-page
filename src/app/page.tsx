import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { WaitlistForm } from "@/components/waitlist-form";
import { isWaitlistConfigured } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

const previews = [
  {
    number: "۰۱",
    title: "کشف رایحه‌ها",
    description: "شناختن نت‌ها و پیدا کردن مسیری که با حس‌وحال تو هماهنگ است.",
  },
  {
    number: "۰۲",
    title: "ساخت عطر شخصی",
    description: "تجربه‌ای که به‌زودی کمک می‌کند امضای بویایی خودت را بسازی.",
  },
  {
    number: "۰۳",
    title: "عطرهای منتخب",
    description: "مجموعه‌ای دوست‌داشتنی و بافکر، برای انتخابی ساده‌تر و مطمئن‌تر.",
  },
];

export default function Home() {
  return (
    <div className="site-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header page-frame">
        <BrandMark />
        <div className="coming-pill" aria-label="آرومان به‌زودی راه‌اندازی می‌شود">
          <span className="coming-dot" aria-hidden="true" />
          <span>به‌زودی</span>
        </div>
      </header>

      <main>
        <section className="hero page-frame" aria-labelledby="hero-title">
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit hero-orbit-one" />
            <div className="hero-orbit hero-orbit-two" />
            <div className="hero-image-frame">
              <Image
                className="hero-image"
                src="/images/aroman-hero.png"
                alt=""
                fill
                priority
                sizes="(max-width: 767px) 88vw, (max-width: 1199px) 45vw, 560px"
              />
              <div className="image-wash" />
            </div>
            <span className="scent-note note-one">روشن</span>
            <span className="scent-note note-two">لطیف</span>
            <span className="scent-note note-three">ماندگار</span>
          </div>

          <div className="hero-copy">
            <p className="eyebrow" dir="ltr">
              <span /> YOUR SCENT. YOUR STORY.
            </p>
            <h1 id="hero-title">هر رایحه، آغاز یک داستان</h1>
            <p className="hero-description">
              به‌زودی جایی برای کشف رایحه‌ها، انتخاب عطرهای دوست‌داشتنی و ساخت
              عطری که شبیه خودته.
            </p>

            <WaitlistForm configured={isWaitlistConfigured()} />

            <Link className="skip-link" href="#world">
              دیدن دنیای آرومان
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M18 13l-6 6-6-6" />
              </svg>
            </Link>
          </div>
        </section>

        <section className="world page-frame" id="world" aria-labelledby="world-title">
          <div className="world-heading">
            <p className="section-kicker">A WORLD OF SCENTS</p>
            <h2 id="world-title">دنیایی که آرام‌آرام شکل می‌گیرد</h2>
            <p>
              آرومان برای یک تجربه ساده، خلاق و شخصی از دنیای عطر در حال ساخته
              شدن است.
            </p>
          </div>

          <div className="preview-grid">
            {previews.map((item) => (
              <article className="preview-card" key={item.number}>
                <span className="preview-number" aria-hidden="true">
                  {item.number}
                </span>
                <div className="preview-icon" aria-hidden="true">
                  <span />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className="preview-status">در راه است</span>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
