"use client";
import type { DeepPortrait } from "@/lib/scent-quest/portrait";
import type { ScentResult } from "@/lib/scent-quest/scoring";
import { AromanEmblem } from "./aroman-emblem";
import { ScentProductImage } from "./scent-product-image";
const digits=(n:number)=>new Intl.NumberFormat("fa-IR").format(n);
export function DeepScentPortrait({result,portrait}:{result:ScentResult;portrait:DeepPortrait}){
 const relativeDescription = (name: string, strength: number) =>
  `${name}؛ ${digits(strength)} از ۱۰۰ در مقیاس نسبی پاسخ‌های تو. ۱۰۰ یعنی پررنگ‌ترین ویژگی در همین پاسخ‌ها. این مقدار امتیاز سازگاری با عطر یا اندازه‌گیری علمی نیست.`;
 return <div className="sq-portrait">
  <section className="sq-portrait-hero">
   <div className="sq-portrait-heading"><p className="sq-kicker">AROMAN · THE COMPLETE PORTRAIT</p><span className="sq-portrait-overline">فصل دوم کامل شد · {digits(15)} انتخاب</span><h2>این، پرتره کامل<br/><em>رایحه توئه.</em></h2><p>{result.archetype.title} — {result.archetype.subtitle}</p><div className="sq-portrait-tags">{result.accords.map(x=><span key={x}>{x}</span>)}</div></div>
   <aside className="sq-portrait-emblem sq-portrait-featured">
    <AromanEmblem aria-hidden="true"/><span>YOUR SCENT · YOUR STORY</span>
    <div className="sq-result-featured">
     <p className="sq-product-feature-label">عطر پیشنهادی اول</p>
     <ScentProductImage className="sq-result-feature-image" perfume={result.recommendations[0]}/>
     <strong>{result.recommendations[0].name}</strong><small>{result.recommendations[0].brand}</small>
     <span>جزئیات هر سه پیشنهاد در ادامه</span>
    </div>
   </aside>
  </section>
  <section className="sq-portrait-story"><div><p className="sq-kicker">01 · FROM FIRST IMPRESSION</p><h3>سلیقه‌ات چه تغییری کرد؟</h3><p>{portrait.evolution}</p></div><div><strong>{digits(portrait.changingPicks)}</strong><span>پیشنهاد تازه در مقایسه با کشف سریع</span></div></section>
  <section className="sq-portrait-facets"><div className="sq-portrait-sectionhead"><p className="sq-kicker">02 · YOUR SCENT DNA</p><h3>شش رنگ برجسته از سلیقه تو</h3><p>این مقیاس، ویژگی‌های پاسخ‌های تو را نسبت به پررنگ‌ترین ویژگی در همین پاسخ‌ها نشان می‌دهد؛ اندازه‌گیری علمی یا امتیاز سازگاری با عطر نیست.</p></div><ul className="sq-portrait-bars">{portrait.top.map((facet,i)=>{const descriptionId=`scent-dna-facet-description-${i}`;return <li key={facet.name} className="sq-portrait-bar"><span className="sq-portrait-rank" aria-hidden="true">{digits(i+1).padStart(2,"۰")}</span><strong>{facet.name}</strong><div className="sq-portrait-meter" role="meter" aria-label={`${facet.name}؛ قدرت نسبی پاسخ‌ها`} aria-describedby={descriptionId} aria-valuemin={0} aria-valuemax={100} aria-valuenow={facet.strength}><i style={{width:facet.strength+"%"}}/></div><span id={descriptionId} className="visually-hidden">{relativeDescription(facet.name,facet.strength)}</span><span className="sq-portrait-value" aria-hidden="true">{digits(facet.strength)} از ۱۰۰</span></li>})}</ul></section>
  <section className="sq-portrait-layers"><div className="sq-portrait-sectionhead"><p className="sq-kicker">03 · A THREE-LAYER STORY</p><h3>رایحه در سه پرده</h3><p>این‌ها انتخاب‌های تو برای شروع، قلب و پایان یک عطرند؛ نه ترکیبات تأییدشده یک محصول.</p></div><div className="sq-portrait-notes"><article><span>✦</span><small>پرده اول · شروع</small><h4>{portrait.opening}</h4></article><article><span>❀</span><small>پرده دوم · قلب</small><h4>{portrait.heart}</h4></article><article><span>◇</span><small>پرده سوم · ماندگاری</small><h4>{portrait.base}</h4></article></div></section>
  <section className="sq-portrait-moments"><div className="sq-portrait-sectionhead"><p className="sq-kicker">04 · MADE FOR YOUR MOMENTS</p><h3>جزئیاتی که امضات رو ساختند</h3></div><div className="sq-portrait-grid">{portrait.backdrop.map(item=><div key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}</div>{portrait.aversion&&<p className="sq-portrait-aversion">رایحه‌ای که ترجیح می‌دی کمتر حس کنی: <strong>{portrait.aversion}</strong></p>}</section>
  <div className="sq-portrait-end"><p className="sq-kicker">THE COMPLETE PORTRAIT</p><h3>پرتره‌ات کامل شد.</h3><p>پیشنهادهای رایحه‌ات رو در ادامه ببین.</p></div>
 </div>;
}
