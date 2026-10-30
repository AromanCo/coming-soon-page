"use client";
import type { DeepPortrait } from "@/lib/scent-quest/portrait";
import type { ScentResult } from "@/lib/scent-quest/scoring";
import { AromanEmblem } from "./aroman-emblem";
const digits=(n:number)=>new Intl.NumberFormat("fa-IR").format(n);
export function DeepScentPortrait({result,portrait,onShare,onStory}:{result:ScentResult;portrait:DeepPortrait;onShare:()=>void;onStory:()=>void}){
 return <div className="sq-portrait">
  <section className="sq-portrait-hero">
   <div className="sq-portrait-heading"><p className="sq-kicker">AROMAN · THE COMPLETE PORTRAIT</p><span className="sq-portrait-overline">فصل دوم کامل شد · {digits(15)} انتخاب</span><h2>این، پرتره کامل<br/><em>رایحه توئه.</em></h2><p>{result.archetype.title} — {result.archetype.subtitle}</p><div className="sq-portrait-tags">{result.accords.map(x=><span key={x}>{x}</span>)}</div></div>
   <div className="sq-portrait-emblem" aria-hidden="true"><AromanEmblem/><span>YOUR SCENT · YOUR STORY</span></div>
  </section>
  <section className="sq-portrait-story"><div><p className="sq-kicker">01 · FROM FIRST IMPRESSION</p><h3>سلیقه‌ات چه تغییری کرد؟</h3><p>{portrait.evolution}</p></div><div><strong>{digits(portrait.changingPicks)}</strong><span>پیشنهاد تازه در مقایسه با کشف سریع</span></div></section>
  <section className="sq-portrait-facets"><div className="sq-portrait-sectionhead"><p className="sq-kicker">02 · YOUR SCENT DNA</p><h3>شش رنگ برجسته از سلیقه تو</h3><p>این میله‌ها سهم نسبی ویژگی‌ها در پاسخ‌های تو را نشان می‌دهند؛ نه درصد سازگاری با عطر.</p></div><div className="sq-portrait-bars">{portrait.top.map((facet,i)=><div key={facet.name} className="sq-portrait-bar"><span>{digits(i+1).padStart(2,"۰")}</span><strong>{facet.name}</strong><div aria-label={facet.name}><i style={{width:facet.strength+"%"}}/></div></div>)}</div></section>
  <section className="sq-portrait-layers"><div className="sq-portrait-sectionhead"><p className="sq-kicker">03 · A THREE-LAYER STORY</p><h3>رایحه در سه پرده</h3><p>این‌ها انتخاب‌های تو برای شروع، قلب و پایان یک عطرند؛ نه ترکیبات تأییدشده یک محصول.</p></div><div className="sq-portrait-notes"><article><span>✦</span><small>پرده اول · شروع</small><h4>{portrait.opening}</h4></article><article><span>❀</span><small>پرده دوم · قلب</small><h4>{portrait.heart}</h4></article><article><span>◇</span><small>پرده سوم · ماندگاری</small><h4>{portrait.base}</h4></article></div></section>
  <section className="sq-portrait-moments"><div className="sq-portrait-sectionhead"><p className="sq-kicker">04 · MADE FOR YOUR MOMENTS</p><h3>جزئیاتی که امضات رو ساختند</h3></div><div className="sq-portrait-grid">{portrait.backdrop.map(item=><div key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}</div>{portrait.aversion&&<p className="sq-portrait-aversion">رایحه‌ای که ترجیح می‌دی کمتر حس کنی: <strong>{portrait.aversion}</strong></p>}</section>
  <div className="sq-portrait-end"><p className="sq-kicker">A STORY WORTH SHARING</p><h3>امضای رایحه‌ات آماده‌ست.</h3><p>این‌بار با یک شناخت کامل‌تر. نتیجه‌ات رو با دوستات به اشتراک بگذار.</p><button className="sq-primary" type="button" onClick={onShare}>اشتراک‌گذاری نتیجه ←</button><button type="button" onClick={onStory}>دانلود کارت استوری ↓</button></div>
 </div>;
}
