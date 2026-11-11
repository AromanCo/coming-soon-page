import type { Metadata } from "next";
import { ScentQuestMini } from "@/components/scent-quest-mini";
import "./mini.css";

export const metadata: Metadata = {
  title: "پیش‌نمایش مینی‌اپ کشف رایحه | آرومان",
  description: "پیش‌نمایش اختصاصی تجربه تصویری کشف رایحه آرومان برای بله و تلگرام.",
  robots: { index: false, follow: false },
};

export default function ScentQuestMiniPage() {
  return <ScentQuestMini />;
}
