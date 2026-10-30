import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { AromanEmblem } from "@/components/aroman-emblem";
import { SCENT_ARCHETYPES, findArchetype } from "@/lib/scent-quest/scoring";
type Props={params:Promise<{slug:string}>};
export function generateStaticParams(){return SCENT_ARCHETYPES.map(a=>({slug:a.slug}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const a=findArchetype(slug);if(!a)return{title:"کشف رایحه | آرومان"};const title="امضای رایحه من: "+a.title+" | آرومان";const description="امضای رایحه من «"+a.title+"» شد! تو هم بازی کشف رایحه آرومان را امتحان کن.";return{title,description,alternates:{canonical:"/scent-quest/result/"+slug},openGraph:{title,description,locale:"fa_IR",url:"/scent-quest/result/"+slug,images:[{url:"/scent-quest/result/"+slug+"/opengraph-image",width:1200,height:630}]},twitter:{card:"summary_large_image",title,description,images:["/scent-quest/result/"+slug+"/opengraph-image"]}};}
export default async function SharedResult({ params }: Props) {
  const { slug } = await params;
  const archetype = findArchetype(slug);
  if (!archetype) notFound();

  return (
    <div className="site-shell">
      <SiteHeader variant="subpage" />
      <main className="sq-status sq-shared-result" id="main-content" tabIndex={-1}>
        <div className="sq-shared-result-card">
          <p className="sq-kicker">YOUR SCENT. YOUR STORY.</p>
          <AromanEmblem className="sq-shared-emblem" />
          <p className="sq-shared-eyebrow">امضای رایحه من</p>
          <h1>{archetype.title}</h1>
          <p className="sq-shared-subtitle">{archetype.subtitle}</p>
          <span className="sq-shared-ornament" aria-hidden="true">
            {archetype.ornament}
          </span>
          <p>
            این یک پرتره بویایی سرگرم‌کننده است؛ تو هم می‌تونی قصه رایحه خودت
            رو پیدا کنی.
          </p>
          <Link className="sq-primary" href="/scent-quest">
            بازی کشف رایحه من ←
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
