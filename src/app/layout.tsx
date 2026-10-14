import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
);

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "آرومان | دنیایی از رایحه‌ها، به‌زودی",
  description:
    "آرومان؛ جایی برای کشف رایحه‌ها، انتخاب عطرهای دوست‌داشتنی و ساخت عطری که شبیه خود شماست.",
  applicationName: "AROMAN",
  keywords: ["آرومان", "عطر", "رایحه", "عطر شخصی", "خرید عطر", "Aroman"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: "/",
    siteName: "AROMAN",
    title: "هر رایحه، آغاز یک داستان | آرومان",
    description:
      "دنیایی برای کشف رایحه‌ها، انتخاب عطرهای دوست‌داشتنی و ساخت عطر شخصی شما.",
    images: [
      {
        url: "/images/aroman-hero.png",
        width: 1024,
        height: 1536,
        alt: "تصویر هنری یک شیشه عطر در فضای روشن و رویایی آرومان",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "هر رایحه، آغاز یک داستان | آرومان",
    description: "دنیایی از رایحه‌ها به‌زودی در آرومان.",
    images: ["/images/aroman-hero.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#F7F2EC",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
