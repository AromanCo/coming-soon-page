import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { SCENT_ARCHETYPES, findArchetype } from "@/lib/scent-quest/scoring";
type Props={params:Promise<{slug:string}>};
export function generateStaticParams(){return SCENT_ARCHETYPES.map(a=>({slug:a.slug}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const a=findArchetype(slug);if(!a)return{title:"کشف رایحه | آرومان"};const title="امضای رایحه من: "+a.title+" | آرومان";const description="امضای رایحه من «"+a.title+"» شد! تو هم بازی کشف رایحه آرومان را امتحان کن.";return{title,description,alternates:{canonical:"/scent-quest/result/"+slug},openGraph:{title,description,locale:"fa_IR",url:"/scent-quest/result/"+slug,images:[{url:"/scent-quest/result/"+slug+"/opengraph-image",width:1200,height:630}]},twitter:{card:"summary_large_image",title,description,images:["/scent-quest/result/"+slug+"/opengraph-image"]}};}
export default async function SharedResult({params}:Props){const {slug}=await params;const a=findArchetype(slug);if(!a)notFound();return <div className="site-shell"><header className="site-header"><div className="header-inner"><BrandMark compact/><Link className="back-link" href="/">بازگشت به آرومان</Link></div></header><main className="sq-status" style={{minHeight:"75vh",background:"#2f2134",color:"#f9efe9"}}><p className="sq-kicker">YOUR SCENT. YOUR STORY.</p><span style={{fontSize:72,color:"#ddb981"}}>{a.ornament}</span><h1 style={{fontSize:"clamp(38px,6vw,68px)"}}>{a.title}</h1><p>{a.subtitle}</p><p>این یک هویت بویایی سرگرم‌کننده است؛ نه تعریف قطعی شخصیت.</p><Link className="sq-primary" href="/scent-quest">تو هم امضای رایحه‌ات رو کشف کن ←</Link></main><SiteFooter/></div>}
