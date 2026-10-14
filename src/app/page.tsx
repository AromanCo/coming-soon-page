import Image from "next/image";
import { BrandMark } from "@/components/brand-mark";
import { ScentExplorer } from "@/components/scent-explorer";
import { SiteFooter } from "@/components/site-footer";
import { WaitlistForm } from "@/components/waitlist-form";
import { isWaitlistConfigured } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header page-frame">
        <BrandMark />
        <a className="header-cta" href="#waitlist">
          دریافت دعوت
        </a>
      </header>

      <main>
        <section className="hero page-frame" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow" dir="ltr" lang="en">
              <span aria-hidden="true" /> MODERN FRAGRANCE ATELIER
            </p>
            <h1 id="hero-title">عطر خودت را کشف کن؛ یا بساز.</h1>
            <p className="hero-description">
              آرومان به‌زودی راهی تازه برای کشف رایحه‌ها، انتخاب عطرهای آماده و
              ساخت عطری مطابق سلیقه‌ات پیش روی تو می‌گذارد.
            </p>

            <div className="early-access-note">
              <span className="invitation-mark" aria-hidden="true">
                <svg viewBox="0 0 48 48">
                  <path d="M9 15.5 24 7l15 8.5v17L24 41 9 32.5v-17Z" />
                  <path d="m14 18 10 7 10-7M24 25v11" />
                </svg>
              </span>
              <span>
                <strong>
                  اولین کسانی باش که استودیوی آرومان را تجربه می‌کنند.
                </strong>
                <small>
                  دعوت‌ها پیش از شروع عمومی و ممکن است به‌صورت مرحله‌ای ارسال
                  شوند.
                </small>
              </span>
            </div>

            <WaitlistForm configured={isWaitlistConfigured()} />
          </div>

          <figure className="hero-art">
            <div className="hero-image-frame">
              <Image
                className="hero-image"
                src="/images/aroman-hero.png"
                alt="چیدمان مفهومی شیشه عطر میان شیشه‌های رنگی و سایه گیاهان"
                fill
                preload
                sizes="(max-width: 699px) calc(100vw - 32px), (max-width: 1099px) 44vw, 540px"
              />
              <div className="image-wash" aria-hidden="true" />
            </div>
            <span className="art-index" aria-hidden="true">
              ۰۱ / ATELIER
            </span>
            <figcaption>تصویر مفهومی؛ محصول نهایی آرومان نیست</figcaption>
            <svg className="botanical-line" viewBox="0 0 140 190" aria-hidden="true">
              <path d="M116 181C75 144 54 99 42 22" />
              <path d="M52 65C30 57 18 43 12 25c21 2 35 15 40 40Z" />
              <path d="M69 112c-2-23 7-40 27-52 4 22-4 39-27 52Z" />
              <path d="M88 147c17-16 35-21 56-14-13 18-32 23-56 14Z" />
            </svg>
          </figure>
        </section>

        <ScentExplorer />

        <section
          className="atelier page-frame"
          id="atelier"
          aria-labelledby="atelier-title"
        >
          <div className="atelier-heading">
            <p className="section-kicker" dir="ltr" lang="en">
              THREE WAYS INTO SCENT
            </p>
            <h2 id="atelier-title">رایحه را از مسیر خودت پیدا کن</h2>
            <p>
              گاهی با یک حس شروع می‌کنی، گاهی با یک عطر آماده و گاهی با ایده‌ای
              که فقط برای خود توست.
            </p>
          </div>

          <div className="atelier-path">
            <article className="atelier-step discovery-step">
              <span className="step-number" aria-hidden="true">۰۱</span>
              <div className="step-copy">
                <p className="step-label">از حس شروع کن</p>
                <h3>کشف رایحه‌ها</h3>
                <p>
                  حال‌وهوای مورد علاقه‌ات را بشناس و زبان ساده‌تری برای انتخاب
                  رایحه پیدا کن.
                </p>
              </div>
              <div className="discovery-glyph" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </article>

            <article className="atelier-step custom-step">
              <span className="step-number" aria-hidden="true">۰۲</span>
              <div className="step-copy">
                <p className="step-label">قلب تجربه آرومان</p>
                <h3>ساخت عطر شخصی</h3>
                <p>
                  در استودیوی آرومان، سلیقه و خاطره‌هایت نقطه شروع ساخت رایحه‌ای
                  می‌شوند که برای تو معنا دارد.
                </p>
                <p className="concept-note">
                  این بخش معرفی یک تجربه در حال توسعه است، نه فرمول‌سازی آنلاین.
                </p>
              </div>
              <div className="scent-study" aria-hidden="true">
                <span className="study-center">تو</span>
                <span className="study-note study-note-one">حس</span>
                <span className="study-note study-note-two">خاطره</span>
                <span className="study-note study-note-three">سلیقه</span>
              </div>
            </article>

            <article className="atelier-step selected-step">
              <span className="step-number" aria-hidden="true">۰۳</span>
              <div className="step-copy">
                <p className="step-label">انتخاب ساده‌تر</p>
                <h3>عطرهای منتخب</h3>
                <p>
                  مجموعه‌ای برای زمانی که می‌خواهی میان رایحه‌های آماده، با
                  اطمینان بیشتری انتخاب کنی.
                </p>
              </div>
              <div className="bottle-study" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </article>
          </div>

          <div className="closing-invitation">
            <p className="section-kicker" dir="ltr" lang="en">BE AMONG THE FIRST</p>
            <h2>وقتی درهای استودیو باز شد، خبرت می‌کنیم.</h2>
            <p>
              عضویت رایگان است؛ دعوت‌های دسترسی زودهنگام ممکن است مرحله‌به‌مرحله
              ارسال شوند.
            </p>
            <a href="#waitlist">به لیست دعوت زودهنگام بپیوند</a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
