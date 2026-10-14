import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
);

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "آرومان | عطرت را کشف کن؛ یا بساز",
  description:
    "آرومان؛ راهی تازه برای کشف رایحه‌ها، انتخاب عطرهای آماده و ساخت عطری مطابق سلیقه شما.",
  applicationName: "AROMAN",
  keywords: ["آرومان", "عطر", "رایحه", "عطر شخصی", "خرید عطر", "Aroman"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: "/",
    siteName: "AROMAN",
    title: "عطرت را کشف کن؛ یا بساز | آرومان",
    description:
      "به لیست دعوت زودهنگام استودیوی ساخت عطر شخصی آرومان بپیوندید.",
    images: [
      {
        url: "/images/aroman-hero.png",
        width: 1024,
        height: 1536,
        alt: "چیدمان مفهومی شیشه عطر در فضای هنری آرومان",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "عطرت را کشف کن؛ یا بساز | آرومان",
    description: "دعوت زودهنگام به تجربه استودیوی ساخت عطر شخصی آرومان.",
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
