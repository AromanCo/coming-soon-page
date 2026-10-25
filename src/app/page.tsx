import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { FragrancePaths } from "@/components/fragrance-paths";
import { HomeFaq } from "@/components/home-faq";
import { ScentExplorer } from "@/components/scent-explorer";
import { ScentJourneyProvider } from "@/components/scent-journey-context";
import { SiteFooter } from "@/components/site-footer";
import { WaitlistForm } from "@/components/waitlist-form";
import { WaitlistLink } from "@/components/waitlist-link";
import { isWaitlistConfigured } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

function ArrowIcon() {
  return (
    <svg className="arrow-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function Home() {
  return (
    <ScentJourneyProvider>
    <div className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <BrandMark compact />
          <nav aria-label="پیمایش اصلی">
            <a href="#story">داستان آرومان</a>
            <a href="#paths">مسیرهای رایحه</a>
            <a href="#explorer">کشف حال‌وهوا</a>
          </nav>
          <WaitlistLink className="header-cta">عضویت در لیست دعوت</WaitlistLink>
        </div>
      </header>

      <main>
        <section className="hero" id="story" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="hero-copy-inner">
              <p className="kicker" dir="ltr" lang="en">
                <span aria-hidden="true" /> MODERN FRAGRANCE ATELIER
              </p>
              <h1 id="hero-title">
                عطر خودت را
                <br />
                کشف کن؛ یا <br className="mobile-title-break" />بساز.
              </h1>
              <p className="hero-description">
                آرومان به‌زودی دنیایی تازه برای کشف رایحه‌ها، انتخاب عطرهای آماده و
                ساخت عطر شخصی پیش روی تو می‌گذارد.
              </p>

              <div className="early-note">
                <BrandMark compact linked={false} />
                <p>
                  از اولین کسانی باش که استودیوی ساخت عطر آرومان را تجربه می‌کنند.
                </p>
              </div>

              <WaitlistForm configured={isWaitlistConfigured()} />
              <Link href="/scent-quest" className="quest-hero-link">
                <span>حوصله یه کشف کوتاه داری؟</span>
                <strong>بازی امضای رایحه · فقط ۷ سؤال <span aria-hidden="true">←</span></strong>
              </Link>
            </div>
          </div>

          <figure className="hero-image">
            <Image
              src="/images/hero-atelier-composite.png"
              alt="چیدمان مفهومی بطری عطر، ویال‌های رایحه و مواد گیاهی"
              fill
              preload
              sizes="(max-width: 900px) 100vw, 50vw"
            />
            <div className="hero-image-overlay" aria-hidden="true" />
            <div className="hero-arch" aria-hidden="true" />
            <div className="image-shimmer" aria-hidden="true" />
            <p className="image-caption" dir="ltr" lang="en">
              YOUR SCENT.
              <br />
              YOUR STORY.
            </p>
            <figcaption className="concept-label">چیدمان مفهومی رایحه</figcaption>
          </figure>
        </section>

        <section className="quest-home-teaser section-shell" aria-labelledby="quest-home-title">
          <div className="quest-home-copy">
            <p className="kicker light" dir="ltr" lang="en"><span aria-hidden="true" /> AROMAN SCENT QUEST</p>
            <span className="quest-home-index">یک بازی، یک امضای رایحه</span>
            <h2 id="quest-home-title">فکر می‌کنی چه عطری شبیه توئه؟</h2>
            <p>هفت انتخاب ساده، یک قصه شخصی. نتیجه‌ات رو ببین، کارت استوری بگیر و اگر کنجکاو بودی عمیق‌تر برو.</p>
            <Link href="/scent-quest" className="quest-home-button">
              کشف رایحه من <span aria-hidden="true">←</span>
            </Link>
            <span className="quest-home-note">بدون ثبت‌نام · دو فصل اختیاری · نتیجه قابل اشتراک</span>
          </div>
          <div className="quest-home-picture" aria-hidden="true">
            <Image src="/images/path-personal.jpg" fill sizes="(max-width: 900px) 100vw, 45vw" alt="" />
            <div className="quest-home-picture-shade" />
            <span>YOUR SCENT.<br />YOUR STORY.</span>
          </div>
        </section>

        <ScentExplorer />
        <FragrancePaths />
        <HomeFaq />

        <section className="invitation" aria-labelledby="invitation-title">
          <Image
            className="invitation-image"
            src="/images/invitation-botanical.jpg"
            alt=""
            fill
            sizes="(max-width: 640px) calc(100vw - 32px), 1200px"
          />
          <div className="invitation-overlay" aria-hidden="true" />
          <div className="section-shell invitation-inner">
            <div>
              <p className="kicker light" dir="ltr" lang="en">
                <span aria-hidden="true" /> BE AMONG THE FIRST
              </p>
              <h2 id="invitation-title">
                به لیست دعوت استودیوی آرومان&nbsp;بپیوند.
              </h2>
              <p>
                به جمع اولین همراهان آرومان بپیوند و از شروع این تجربه باخبر شو.
              </p>
            </div>
            <WaitlistLink className="invitation-button">
              <span>عضویت در لیست دعوت</span>
              <ArrowIcon />
            </WaitlistLink>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
    </ScentJourneyProvider>
  );
}
