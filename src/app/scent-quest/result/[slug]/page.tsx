import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { AromanEmblem } from "@/components/aroman-emblem";
import { SCENT_ARCHETYPES, findArchetype } from "@/lib/scent-quest/scoring";
type Props={params:Promise<{slug:string}>};
export function generateStaticParams(){return SCENT_ARCHETYPES.map(a=>({slug:a.slug}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const a=findArchetype(slug);if(!a)return{title:"کشف رایحه | آرومان"};const title="امضای رایحه من: "+a.title+" | آرومان";const description="امضای رایحه من «"+a.title+"» شد! تو هم بازی کشف رایحه آرومان را امتحان کن.";return{title,description,alternates:{canonical:"/scent-quest/result/"+slug},openGraph:{title,description,locale:"fa_IR",url:"/scent-quest/result/"+slug,images:[{url:"/scent-quest/result/"+slug+"/opengraph-image",width:1200,height:630}]},twitter:{card:"summary_large_image",title,description,images:["/scent-quest/result/"+slug+"/opengraph-image"]}};}
export default async function SharedResult({params}:Props){const {slug}=await params;const a=findArchetype(slug);if(!a)notFound();return <div className="site-shell"><header className="site-header"><div className="header-inner"><BrandMark compact/><Link className="back-link" href="/">بازگشت به آرومان</Link></div></header><main className="sq-status sq-shared-result"><div className="sq-shared-result-card"><p className="sq-kicker">YOUR SCENT. YOUR STORY.</p><AromanEmblem className="sq-shared-emblem"/><p className="sq-shared-eyebrow">امضای رایحه من</p><h1>{a.title}</h1><p className="sq-shared-subtitle">{a.subtitle}</p><span className="sq-shared-ornament" aria-hidden="true">{a.ornament}</span><p>این یک پرتره بویایی سرگرم‌کننده است؛ تو هم می‌تونی قصه رایحه خودت رو پیدا کنی.</p><Link className="sq-primary" href="/scent-quest">بازی کشف رایحه من ←</Link></div></main><SiteFooter/></div>}
