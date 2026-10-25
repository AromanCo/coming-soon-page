import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ScentQuestGame } from "@/components/scent-quest-game";
import { SiteFooter } from "@/components/site-footer";
export const metadata: Metadata = {title:"بازی کشف امضای رایحه | آرومان", description:"۷ سؤال، یک امضای رایحه. نتیجه را با دوستانت به اشتراک بگذار و اگر خواستی ۸ سؤال دیگر عمیق‌تر برو.", alternates:{canonical:"/scent-quest"}};
export default function ScentQuestPage(){return <div className="site-shell"><header className="site-header"><div className="header-inner"><BrandMark compact/><Link className="back-link" href="/">بازگشت به آرومان</Link></div></header><ScentQuestGame/><SiteFooter/></div>}
