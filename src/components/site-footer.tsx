import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { SocialLinks } from "./social-links";

export function SiteFooter() {
  const currentYear = new Intl.NumberFormat("fa-IR", {
    useGrouping: false,
  }).format(new Date().getFullYear());

  return (
    <footer className="site-footer">
      <div className="section-shell footer-inner">
      <BrandMark compact />
      <p className="tagline" dir="ltr" lang="en">
        Your Scent. Your Story.
      </p>
      <div className="footer-links">
        <SocialLinks />
        <Link href="/privacy">حریم خصوصی</Link>
      </div>
      <p className="copyright">
        © {currentYear} آرومان. همه حقوق محفوظ است.
      </p>
      </div>
    </footer>
  );
}
