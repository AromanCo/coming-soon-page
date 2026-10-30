import type { Metadata } from "next";
import { ScentQuestGame } from "@/components/scent-quest-game";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
export const metadata: Metadata = {title:"بازی کشف امضای رایحه | آرومان", description:"۷ سؤال، یک امضای رایحه. نتیجه را با دوستانت به اشتراک بگذار و اگر خواستی ۸ سؤال دیگر عمیق‌تر برو.", alternates:{canonical:"/scent-quest"}};
export default function ScentQuestPage(){return <div className="site-shell"><SiteHeader variant="subpage"/><ScentQuestGame/><SiteFooter/></div>}
