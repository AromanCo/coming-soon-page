import Link from "next/link";
import { BrandMark } from "./brand-mark";

const socialLinks = [
  { label: "اینستاگرام", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL },
  { label: "لینکدین", url: process.env.NEXT_PUBLIC_LINKEDIN_URL },
].filter((item): item is { label: string; url: string } => Boolean(item.url));

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
        {socialLinks.map((social) => (
          <a key={social.label} href={social.url} rel="noreferrer" target="_blank">
            {social.label}
          </a>
        ))}
        <Link href="/privacy">حریم خصوصی</Link>
      </div>
      <p className="copyright">
        © {currentYear} آرومان. همه حقوق محفوظ است.
      </p>
      </div>
    </footer>
  );
}
