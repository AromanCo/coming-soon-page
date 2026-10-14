import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "حریم خصوصی لیست دعوت | آرومان",
  description: "اطلاعات مربوط به نحوه پردازش داده‌های لیست دعوت آرومان.",
  robots: { index: true, follow: true },
};

const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL;

export default function PrivacyPage() {
  return (
    <div className="site-shell privacy-shell">
      <header className="site-header page-frame">
        <BrandMark />
        <Link className="back-link" href="/">
          بازگشت به صفحه اصلی
        </Link>
      </header>

      <main className="privacy-main page-frame">
        <div className="privacy-heading">
          <p className="section-kicker">PRIVACY</p>
          <h1>حریم خصوصی لیست دعوت</h1>
          <p>
            این توضیحات فقط به فرم لیست دعوت در وب‌سایت پیش‌راه‌اندازی آرومان
            مربوط است.
          </p>
        </div>

        <div className="privacy-content">
          <section>
            <h2>چه اطلاعاتی ثبت می‌شود؟</h2>
            <p>
              ایمیل، زمان اعلام رضایت، منبع ثبت‌نام و اطلاعات فنی محدود شامل
              شناسه شبکه به‌شکل هش‌شده و مشخصات مرورگر ثبت می‌شود. اطلاعات فنی
              برای جلوگیری از سوءاستفاده و حفظ امنیت فرم استفاده می‌شود.
            </p>
          </section>

          <section>
            <h2>چرا این اطلاعات را می‌گیریم؟</h2>
            <p>
              برای ارسال دعوت‌های دسترسی زودهنگام به استودیوی آرومان و خبرهای
              مستقیم مرتبط با راه‌اندازی. ایمیل شما برای تبلیغات شخص ثالث
              فروخته یا در اختیار آن‌ها قرار داده نمی‌شود.
            </p>
          </section>

          <section>
            <h2>مبنای رضایت</h2>
            <p>
              عضویت تنها پس از انتخاب صریح گزینه رضایت برای دریافت دعوت‌نامه و
              خبرهای مرتبط انجام می‌شود. اگر این گزینه انتخاب نشود، هیچ عضویتی
              ثبت نخواهد شد.
            </p>
          </section>

          <section>
            <h2>مدت نگهداری و حذف</h2>
            <p>
              اطلاعات تا زمانی نگهداری می‌شود که برای اطلاع‌رسانی شروع آرومان
              لازم باشد یا درخواست حذف آن را مطرح کنید. داده‌های محدودکننده
              سوءاستفاده نیز باید به‌صورت دوره‌ای پاک‌سازی شوند.
            </p>
          </section>

          <section>
            <h2>درخواست دسترسی یا حذف</h2>
            {privacyEmail ? (
              <p>
                برای دریافت نسخه اطلاعات یا حذف ایمیل خود با{" "}
                <a href={"mailto:" + privacyEmail}>{privacyEmail}</a> تماس
                بگیرید.
              </p>
            ) : (
              <p>
                راه ارتباطی مسئول حریم خصوصی هنوز در تنظیمات وب‌سایت وارد نشده
                است و باید پیش از انتشار عمومی پیکربندی شود.
              </p>
            )}
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
