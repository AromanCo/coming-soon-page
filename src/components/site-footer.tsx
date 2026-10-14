import Link from "next/link";
import { BrandMark } from "./brand-mark";

const socialLinks = [
  { label: "اینستاگرام", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL },
  { label: "لینکدین", url: process.env.NEXT_PUBLIC_LINKEDIN_URL },
].filter((item): item is { label: string; url: string } => Boolean(item.url));

export function SiteFooter() {
  return (
    <footer className="site-footer page-frame">
      <BrandMark />
      <p className="footer-signature">Your Scent. Your Story.</p>
      <div className="footer-links">
        {socialLinks.map((social) => (
          <a key={social.label} href={social.url} rel="noreferrer" target="_blank">
            {social.label}
          </a>
        ))}
        <Link href="/privacy">حریم خصوصی</Link>
      </div>
      <p className="copyright">
        © {new Date().getFullYear()} آرومان. همه حقوق محفوظ است.
      </p>
    </footer>
  );
}
