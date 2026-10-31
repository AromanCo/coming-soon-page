import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "حریم خصوصی لیست دعوت | آرومان",
  description:
    "اطلاعات حریم خصوصی لیست دعوت آرومان و بارگذاری تصاویر عطر در تجربه رایحه.",
  robots: { index: true, follow: true },
};

const privacyEmailCandidate = process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim();
const privacyEmail =
  privacyEmailCandidate &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(privacyEmailCandidate)
    ? privacyEmailCandidate
    : null;

const privacyJourney = [
  {
    title: "ثبت با رضایت روشن",
    text: "شماره موبایل را وارد می‌کنی و فقط پس از انتخاب صریح گزینه رضایت، درخواست عضویت فرستاده می‌شود.",
  },
  {
    title: "بررسی و نگهداری",
    text: "سرور قالب شماره و رضایت را بررسی می‌کند و سپس داده‌های لازم را در پایگاه داده نگه می‌دارد.",
  },
  {
    title: "دعوت در آینده، نه امروز",
    text: "این نسخه پیامکی ارسال نمی‌کند. اگر سرویس پیامک تأیید و راه‌اندازی شود، شماره می‌تواند برای دعوت‌نامه و خبرهای شروع آرومان استفاده شود.",
  },
  {
    title: "امکان درخواست حذف",
    text: "درخواست دسترسی یا حذف شماره از راه ارتباطی رسمی همین صفحه برای آرومان فرستاده می‌شود.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <div className="site-shell privacy-shell">
      <SiteHeader variant="subpage" backLabel="بازگشت به صفحه اصلی" />

      <main className="privacy-main" id="main-content" tabIndex={-1}>
        <section className="privacy-hero page-frame" aria-labelledby="privacy-title">
          <div className="privacy-heading">
            <p className="kicker" dir="ltr" lang="en">
              <span aria-hidden="true" /> PRIVACY AT AROMAN
            </p>
            <h1 id="privacy-title">رایحه شخصی است؛ اطلاعات تو هم همین‌طور.</h1>
            <p>
              این صفحه با زبان روشن توضیح می‌دهد شماره موبایلی که در فرم لیست
              دعوت وارد می‌کنی، در نسخه پیش‌راه‌اندازی آرومان چه مسیری دارد.
            </p>
          </div>
          <aside className="privacy-hero-note" aria-label="خلاصه وضعیت فعلی">
            <span className="privacy-note-mark" aria-hidden="true">۰</span>
            <div>
              <p>وضعیت فعلی</p>
              <strong>هیچ پیامکی از این نسخه ارسال نمی‌شود.</strong>
              <span>
                ثبت شماره به‌معنای تأیید مالکیت آن یا ارسال فوری دعوت‌نامه نیست.
              </span>
            </div>
          </aside>
        </section>

        <section
          className="privacy-journey-section"
          aria-labelledby="privacy-journey-title"
        >
          <div className="section-shell">
            <div className="privacy-section-heading">
              <p className="kicker light" dir="ltr" lang="en">
                <span aria-hidden="true" /> YOUR DATA JOURNEY
              </p>
              <h2 id="privacy-journey-title">
                شماره‌ات پیش آرومان چه مسیری دارد؟
              </h2>
            </div>
            <ol className="privacy-journey">
              {privacyJourney.map((step, index) => (
                <li key={step.title}>
                  <span className="journey-number" aria-hidden="true">
                    {new Intl.NumberFormat("fa-IR", {
                      minimumIntegerDigits: 2,
                      useGrouping: false,
                    }).format(index + 1)}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="privacy-details page-frame">
          <article className="privacy-policy" aria-labelledby="policy-title">
            <div className="privacy-section-heading dark">
              <p className="kicker" dir="ltr" lang="en">
                <span aria-hidden="true" /> THE DETAILS
              </p>
              <h2 id="policy-title">جزئیات سیاست لیست دعوت</h2>
              <p>
                این سیاست فقط به فرم لیست دعوت در وب‌سایت پیش‌راه‌اندازی آرومان
                مربوط است.
              </p>
            </div>

            <section>
              <h3>چه اطلاعاتی ثبت می‌شود؟</h3>
              <p>
                شماره موبایل در قالب استاندارد، زمان اعلام رضایت، منبع ثبت‌نام
                و اطلاعات فنی محدود شامل شناسه شبکه به‌شکل هش‌شده و مشخصات
                مرورگر ثبت می‌شود. اطلاعات فنی برای پیشگیری از سوءاستفاده و حفظ
                امنیت فرم پردازش می‌شود.
              </p>
            </section>

            <section>
              <h3>هدف استفاده چیست؟</h3>
              <p>
                شماره موبایل برای لیست دعوت استودیوی آرومان و خبرهای مرتبط با
                شروع فعالیت نگهداری می‌شود. اگر در آینده سرویس پیامک تأیید و
                راه‌اندازی شود، ممکن است برای همین هدف از شماره استفاده شود.
                آرومان شماره را برای تبلیغات شخص ثالث نمی‌فروشد یا در اختیار
                آن‌ها قرار نمی‌دهد.
              </p>
            </section>

            <section>
              <h3>رضایت و تأیید شماره</h3>
              <p>
                عضویت فقط پس از انتخاب صریح گزینه رضایت ثبت می‌شود. در نسخه
                فعلی رمز یک‌بارمصرفی فرستاده نمی‌شود؛ پس شماره ذخیره‌شده هنوز
                به‌عنوان شماره تحت مالکیت ثبت‌کننده تأیید نشده است.
              </p>
            </section>

            <section>
              <h3>نگهداری و حذف</h3>
              <p>
                اطلاعات برای هدف لیست دعوت نگهداری می‌شود یا می‌توانی درخواست
                حذف آن را مطرح کنی. این نسخه مدت ثابت یا حذف خودکار داده را
                وعده نمی‌دهد. داده‌های فنی محدود نیز برای امنیت و کنترل
                سوءاستفاده پردازش می‌شوند.
              </p>
            </section>
          </article>

          <aside className="privacy-aside">
            <section className="privacy-contact" aria-labelledby="contact-title">
              <p className="contact-eyebrow">درخواست دسترسی یا حذف</p>
              <h2 id="contact-title">کنترل شماره‌ات دست توست.</h2>
              <p>
                برای دریافت نسخه اطلاعات ثبت‌شده یا درخواست حذف شماره، از مسیر
                رسمی زیر با آرومان تماس بگیر.
              </p>
              {privacyEmail ? (
                <a className="privacy-contact-link" href={`mailto:${privacyEmail}`}>
                  <span>ارسال درخواست حریم خصوصی</span>
                  <small dir="ltr">{privacyEmail}</small>
                </a>
              ) : (
                <p className="privacy-contact-missing" role="note">
                  راه ارتباطی رسمی حریم خصوصی هنوز پیکربندی نشده است و باید پیش
                  از انتشار عمومی اضافه شود.
                </p>
              )}
            </section>

            <section className="privacy-principles" aria-labelledby="principles-title">
              <h2 id="principles-title">خلاصه تعهد آرومان</h2>
              <ul>
                <li>ثبت فقط با رضایت صریح</li>
                <li>بدون ارسال پیامک در نسخه فعلی</li>
                <li>بدون ادعای تأیید مالکیت شماره</li>
                <li>بدون فروش شماره به تبلیغ‌کنندگان ثالث</li>
              </ul>
            </section>
          </aside>
        </div>

        <section className="privacy-details page-frame" aria-labelledby="scent-image-privacy-title">
          <article className="privacy-policy">
            <div className="privacy-section-heading dark">
              <h2 id="scent-image-privacy-title">بارگذاری تصویر عطر در تجربه رایحه</h2>
              <p>
                برای نمایش عکس عطرهای پیشنهادی، مرورگر مستقیماً تصویر را از
                دامنه atrafshan.net دریافت می‌کند. این درخواست ممکن است نشانی
                شبکه، زمان درخواست، اطلاعات فنی مرورگر و نشانی فایل تصویرِ
                محصول پیشنهادی را برای ارائه‌دهنده تصویر آشکار کند؛ بنابراین
                ممکن است از روی فایل درخواست‌شده، محصول پیشنهادی قابل حدس باشد.
              </p>
              <p>
                درخواست تصویر مسیر صفحه را در سربرگ Referer نمی‌فرستد و برای
                بارگذاری بدون کوکی از CORS ناشناس استفاده می‌کند. مبدأ
                aroman.ir برای بررسی CORS ارسال می‌شود. پاسخ‌های کوییز و
                اطلاعات لیست دعوت در این درخواست گنجانده نمی‌شوند. اگر تصویر
                بارگذاری نشود، تجربه از نشان آرومان استفاده می‌کند.
              </p>
            </div>
          </article>
        </section>

        <section className="privacy-faq page-frame" aria-labelledby="faq-title">
          <div className="privacy-section-heading dark">
            <p className="kicker" dir="ltr" lang="en">
              <span aria-hidden="true" /> SHORT ANSWERS
            </p>
            <h2 id="faq-title">پرسش‌های رایج</h2>
          </div>
          <div className="privacy-faq-list">
            <details>
              <summary>الان بعد از عضویت پیامک می‌گیرم؟</summary>
              <p>
                خیر. سرویس پیامک در این نسخه راه‌اندازی نشده و ثبت موفق فقط
                دریافت شماره برای لیست دعوت را تأیید می‌کند.
              </p>
            </details>
            <details>
              <summary>آیا آرومان مطمئن است شماره برای من است؟</summary>
              <p>
                خیر. چون فرایند OTP وجود ندارد، مالکیت شماره در نسخه فعلی
                تأیید نمی‌شود.
              </p>
            </details>
            <details>
              <summary>چرا شناسه شبکه به‌شکل هش‌شده ثبت می‌شود؟</summary>
              <p>
                برای محدودکردن تلاش‌های پرتعداد و محافظت از فرم در برابر
                سوءاستفاده؛ سامانه شناسه خام شبکه را در رکورد عضویت ذخیره
                نمی‌کند.
              </p>
            </details>
            <details>
              <summary>چطور درخواست حذف بدهم؟</summary>
              <p>
                از راه ارتباطی رسمی بخش «درخواست دسترسی یا حذف» در همین صفحه
                استفاده کن. اگر این راه هنوز نمایش داده نمی‌شود، انتشار عمومی
                صفحه باید تا پیکربندی آن متوقف بماند.
              </p>
            </details>
          </div>
          <Link className="privacy-home-link" href="/">
            <span aria-hidden="true">→</span>
            بازگشت به تجربه آرومان
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
