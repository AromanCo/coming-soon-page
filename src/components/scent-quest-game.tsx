"use client";
import { useEffect, useRef, useState } from "react";
import { AromanEmblem } from "./aroman-emblem";
import { DeepScentPortrait } from "./deep-scent-portrait";
import { buildDeepPortrait } from "@/lib/scent-quest/portrait";
import Link from "next/link";
import quiz from "@/lib/scent-quest/quiz-data.json";
import { rankScentQuest, type ScentChoice, type ScentAnswers, type ScentPerfume, type ScentResult, type ScentStage } from "@/lib/scent-quest/scoring";

const quick = quiz.stage1_questions;
const deep = quiz.stage2_questions;
let catalogPromise: Promise<ScentPerfume[]> | undefined;
function getCatalog() {
  if (!catalogPromise) catalogPromise = fetch("/data/scent-quest-perfumes.json").then(async r => {
    if (!r.ok) throw new Error("Catalog unavailable");
    const data: unknown = await r.json();
    if (!Array.isArray(data) || data.length !== 900) throw new Error("Invalid catalog");
    return data as ScentPerfume[];
  }).catch((error: unknown) => { catalogPromise = undefined; throw error; });
  return catalogPromise;
}
function shareLink(result: ScentResult) {
  return new URL("/scent-quest/result/" + result.archetype.slug, window.location.origin).toString();
}
function card(result: ScentResult, format: "story" | "post") {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = format === "story" ? 1920 : 1080;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("No canvas");
  const height = canvas.height;
  const grad = g.createLinearGradient(0,0,1080,height);
  grad.addColorStop(0,"#291b2e");grad.addColorStop(.6,"#52374b");grad.addColorStop(1,"#977262");
  g.fillStyle = grad;g.fillRect(0,0,1080,height);
  g.strokeStyle = "rgba(236,185,129,.55)";
  for(let i=0;i<4;i++){g.beginPath();g.ellipse(540,height*.40,220+i*65,290+i*50,0,0,Math.PI*2);g.stroke();}
  g.textAlign="center";g.fillStyle="#f5e8df";g.font="55px Georgia,serif";
  g.fillText("A R O M A N",540,125);
  g.save();g.translate(540,format==="story"?300:230);g.strokeStyle="#E4BB77";g.lineWidth=5;
  const hex=(radius:number)=>{g.beginPath();for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3,x=Math.cos(a)*radius,y=Math.sin(a)*radius;if(i===0)g.moveTo(x,y);else g.lineTo(x,y);}g.closePath();g.stroke();};
  hex(65);hex(52);hex(43);g.beginPath();g.moveTo(-15,14);g.lineTo(0,-13);g.lineTo(15,14);g.moveTo(-22,26);g.lineTo(22,26);g.moveTo(-22,39);g.lineTo(22,39);g.stroke();g.restore();

  g.fillStyle="#e6bc87";g.font="24px Georgia,serif";g.fillText("YOUR SCENT. YOUR STORY.",540,181);
  const center=height*.45;g.fillStyle="rgba(245,220,186,.3)";
  g.beginPath();g.roundRect(425,center-170,230,280,34);g.fill();
  g.fillStyle="#eed0a6";g.fillRect(498,center-208,84,35);
  g.fillStyle="#fff7ea";g.font='bold 75px "Vazirmatn Variable",Tahoma,sans-serif';
  g.fillText(result.archetype.title,540,center+220,980);
  g.font='33px "Vazirmatn Variable",Tahoma,sans-serif';
  g.fillText(result.archetype.subtitle,540,center+287,980);
  g.font='28px "Vazirmatn Variable",Tahoma,sans-serif';
  result.accords.forEach((a,i)=>g.fillText(a,540,center+360+i*49,980));
  g.font="32px Georgia,serif";g.fillStyle="#f4d3a0";g.fillText("aroman.ir/scent-quest",540,height-100);
  return canvas;
}
async function exportCard(result:ScentResult, format:"story"|"post"){
  await document.fonts.ready;
  const blob=await new Promise<Blob|null>(resolve=>card(result,format).toBlob(resolve,"image/png"));
  if(!blob)throw new Error("Export failed");
  return blob;
}
export function ScentQuestGame(){
  const [mode,setMode]=useState<"intro"|"question"|"loading"|"result"|"error">("intro");
  const [stage,setStage]=useState<ScentStage>("quick");
  const [index,setIndex]=useState(0);
  const [answers,setAnswers]=useState<Partial<ScentAnswers>>({});
  const [result,setResult]=useState<ScentResult|null>(null);
  const [quickResult,setQuickResult]=useState<ScentResult|null>(null);
  const [feedback,setFeedback]=useState("");
  const advanceTimer = useRef<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Avoid advancing after leaving the page or moving backwards.
  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
    };
  }, []);

  const ids=stage==="quick"?quick:deep;
  const q=quiz.questions.find(item=>item.id===ids[index]);
  const chosen=q?answers[q.id]:undefined;
  const questionPhotos:Record<string,string[]> = {
    Q09:["scent-citrus.jpg","path-selected.jpg","invitation-botanical.jpg","scent-woody.jpg"],
    Q01:["scent-citrus.jpg","scent-floral.jpg","scent-woody.jpg","invitation-botanical.jpg"],
    Q02:["scent-citrus.jpg","path-selected.jpg","path-discover.jpg","scent-woody.jpg"],
    Q03:["scent-floral.jpg","path-selected.jpg","path-discover.jpg","scent-woody.jpg"],
    Q04:["scent-woody.jpg","hero-atelier-composite.png","invitation-botanical.jpg","path-personal.jpg"],
    Q05:["path-personal.jpg","scent-citrus.jpg","scent-floral.jpg","invitation-botanical.jpg"],
    Q06:["scent-citrus.jpg","path-discover.jpg","scent-woody.jpg","invitation-botanical.jpg"],
    Q07:["path-discover.jpg","scent-citrus.jpg","path-selected.jpg","path-personal.jpg"],
    Q08:["scent-woody.jpg","scent-citrus.jpg","invitation-botanical.jpg","path-selected.jpg"],
    Q10:["scent-floral.jpg","scent-woody.jpg","path-selected.jpg","hero-atelier-composite.png"],
    Q11:["path-personal.jpg","scent-citrus.jpg","scent-floral.jpg","invitation-botanical.jpg"],
    Q12:["scent-floral.jpg","scent-citrus.jpg","scent-woody.jpg","path-discover.jpg"],
    Q13:["path-personal.jpg","path-selected.jpg","hero-atelier-composite.png","path-discover.jpg"],
    Q14:["path-selected.jpg","path-personal.jpg","invitation-botanical.jpg","scent-citrus.jpg"],
    Q15:["invitation-botanical.jpg","scent-floral.jpg","scent-woody.jpg","path-discover.jpg"],
  };
  function optionSymbol(label:string){
    if(/مرکبات|ترنج|لیمو|پرتقال/.test(label))return "🍊";
    if(/سیب|گلابی|میوه/.test(label))return "🍐";
    if(/رز|گل|یاس|مریم|شکوفه/.test(label))return "🌸";
    if(/سبز|گیاه|نعناع|بهار/.test(label))return "🌿";
    if(/چوب|سدر|صندل|خاک|خس/.test(label))return "🪵";
    if(/عود|چرم|دود|تنباکو/.test(label))return "◈";
    if(/کهربا|وانیل|شیرین|خوراکی|تونکا/.test(label))return "🍯";
    if(/فلفل|هل|ادویه|دارچین|زعفران|زنجبیل/.test(label))return "✺";
    if(/تمیز|صابونی|پودری|مشک|لباس/.test(label))return "✧";
    if(/دریا|باران|آب|خنک|تابستان/.test(label))return "≈";
    if(/گرم|آتش|پاییز|زمستان/.test(label))return "☼";
    if(/شب|مهمانی|قرار/.test(label))return "☾";
    if(/روزمره|کار|جلسه/.test(label))return "✦";
    if(/زنانه/.test(label))return "❀";
    if(/مردانه/.test(label))return "◇";
    if(/ساده|کم|خشک/.test(label))return "○";
    if(/پیچیده|زیاد|عمیق/.test(label))return "❖";
    return "✶";
  }
  const microcopy=["اولین حست رو دنبال کن.","انتخابی که بهت نزدیک‌تره کدومه؟","هر جواب، یک لایه از قصه توئه.","خودت رو به این فضاها بسپار.","یک قدم به کشف رایحه نزدیک‌تر شدی.","چند انتخاب تا امضای تو مونده.","آخرین انتخاب این فصل!"];

  function start(){setMode("question");setStage("quick");setIndex(0);}
  async function finish(currentAnswers:Partial<ScentAnswers>=answers){
    setMode("loading");
    try{
      const data=await getCatalog();
      const res=rankScentQuest(quiz,data,currentAnswers,stage);
      setResult(res);if(stage==="quick")setQuickResult(res);
      setMode("result");
    }catch{setMode("error");}
  }

  function pick(choice: ScentChoice) {
    // Only one transition per question; rapid double-clicks must not skip it.
    if (!q || transitioning || advanceTimer.current !== null) return;
    const updatedAnswers: Partial<ScentAnswers> = { ...answers, [q.id]: choice };
    setAnswers(updatedAnswers);
    setTransitioning(true);

    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      setTransitioning(false);
      if (index < ids.length - 1) {
        setIndex((current) => current + 1);
      } else {
        // Pass the just-selected answer rather than waiting for React state.
        void finish(updatedAnswers);
      }
    }, 340);
  }

  function previous(){
    if(advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setTransitioning(false);
    if(index>0)setIndex(index-1);
    else if(stage==="deep"&&quickResult){setResult(quickResult);setStage("quick");setMode("result");}
    else setMode("intro");
  }
  async function download(format:"story"|"post"){
    if(!result)return;
    try{
      const blob=await exportCard(result,format),url=URL.createObjectURL(blob);
      const link=document.createElement("a");link.href=url;link.download="AROMAN-"+result.archetype.slug+"-"+format+".png";
      document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setFeedback("کارت رایحه آماده شد.");
    }catch{setFeedback("ساخت تصویر در این مرورگر ممکن نیست. از لینک استفاده کن.");}
  }
  async function copy(){
    if(!result)return;
    try{await navigator.clipboard.writeText("امضای رایحه من: "+result.archetype.title+" ✨\n"+shareLink(result));setFeedback("متن و لینک کپی شد.");}
    catch{setFeedback("کپی خودکار ممکن نشد؛ می‌تونی آدرس نتیجه رو باز و کپی کنی.");}
  }
  async function share(){
    if(!result)return;
    if(navigator.share)try{
      const blob=await exportCard(result,"story"),file=new File([blob],"AROMAN-story.png",{type:"image/png"});
      const text="امضای رایحه من: "+result.archetype.title;
      if(navigator.canShare?.({files:[file]}))await navigator.share({title:"آرومان",text,files:[file]});
      else await navigator.share({title:"آرومان",text,url:shareLink(result)});
      return;
    }catch(e){if(e instanceof DOMException&&e.name==="AbortError")return;}
    await copy();
  }
  return <main className="sq-page">
    {mode==="intro"&&<section className="sq-intro">
      <div><p className="sq-kicker">AROMAN — SCENT QUEST</p><h1>هر رایحه،<br/><em>یک داستان.</em><br/>داستان تو چیه؟</h1>
        <p>با ۷ انتخاب ساده امضای رایحه‌ات رو کشف کن. اگر کنجکاو شدی، ۸ سؤال دیگه عمیق‌تر برو.</p>
        <button className="sq-primary" type="button" onClick={start}>شروع بازی کشف رایحه ←</button>
        <p className="sq-small">بدون ثبت‌نام · بدون جواب غلط · نتیجه قابل اشتراک</p>
      </div><aside aria-hidden="true"><span>YOUR SCENT.<br/>YOUR STORY.</span></aside>
    </section>}
    {mode==="question"&&q&&<section className="sq-play" aria-labelledby="sq-title">
      <div className="sq-progress-head"><span>{stage==="quick"?"فصل اول · کشف سریع":"فصل دوم · کشف عمیق"}</span><span>{new Intl.NumberFormat("fa-IR").format(index+1)} از {new Intl.NumberFormat("fa-IR").format(ids.length)}</span></div>
      <div className="sq-progress"><span style={{width:(index+1)/ids.length*100+"%"}}/></div>
      <p className="sq-kicker">{stage==="quick"?"FIRST IMPRESSION":"GO DEEPER"}</p>
      <h2 id="sq-title">{q.id==="Q09"?"کدوم فضا بیشتر شبیه دنیای توئه؟":q.id==="Q15"?"کدوم رایحه رو ترجیح می‌دی کمتر حس کنی؟":q.text}</h2>
      <p className="sq-muted">{microcopy[index%microcopy.length]}</p>
      <div className="sq-options sq-visual">{q.options.map((o,i)=><button key={o.id}
        className={chosen===o.id?"sq-option active":"sq-option"} aria-pressed={chosen===o.id}
        type="button" onClick={()=>pick(o.id as ScentChoice)}>
        <span aria-hidden="true" className="sq-photo" style={{backgroundImage:`linear-gradient(0deg,rgba(25,18,31,.8),rgba(25,18,31,.12)),url("/images/${questionPhotos[q.id]?.[i] || "scent-citrus.jpg"}")`}}/>
        <span className="sq-option-motif" aria-hidden="true">{optionSymbol(o.label)}</span><span className="sq-option-label"><i>{new Intl.NumberFormat("fa-IR",{minimumIntegerDigits:2,useGrouping:false}).format(i+1)}</i>{o.label}<b>{chosen===o.id?"✓":"○"}</b></span>
      </button>)}</div>
      <div className="sq-navigation"><button onClick={previous} type="button">→ بازگشت</button>
        <span className="sq-auto-hint" aria-live="polite">{transitioning?"داریم می‌ریم سؤال بعدی…":"با انتخاب هر گزینه، خودکار ادامه می‌دی."}</span></div>
      
    </section>}
    {mode==="loading"&&<section className="sq-status" role="status"><span>✧</span><h2>قصه رایحه‌ات داره شکل می‌گیره…</h2></section>}
    {mode==="error"&&<section className="sq-status" role="alert"><h2>کاتالوگ در دسترس نیست.</h2><p>جواب‌ها از بین نرفتن.</p><button className="sq-primary" onClick={()=>void finish()}>تلاش دوباره</button><button onClick={()=>setMode("question")}>بازگشت</button></section>}
    {mode==="result"&&result&&<section className="sq-results">
      {stage==="deep"&&<DeepScentPortrait result={result} portrait={buildDeepPortrait(quiz,answers,result,quickResult)} onShare={()=>void share()} onStory={()=>void download("story")}/>}
      {stage==="quick"&&<div className="sq-result-hero">
        <div><p className="sq-kicker">YOUR SCENT IDENTITY</p><p>{stage==="quick"?"کشف اولیه تو":"امضای دقیق‌تر تو"}</p>
          <span className="sq-glyph">{result.archetype.ornament}</span><h2>{result.archetype.title}</h2>
          <p>{result.archetype.subtitle}</p><div className="sq-accords">{result.accords.map(a=><span key={a}>{a}</span>)}</div></div>
        <aside className="sq-result-art" aria-hidden="true"><AromanEmblem /><span>YOUR SCENT. YOUR STORY.</span></aside>
      </div>}
      {stage==="quick"&&<div className="sq-deep sq-deep-prominent"><div><p className="sq-kicker">ACT II · GO DEEPER</p><h3>قصه رایحه‌ات هنوز ادامه داره…</h3><p>۸ سؤال دیگر؛ شناخت دقیق‌تر نت‌ها، سلیقه و پیشنهادهای تازه‌تر.</p></div><button className="sq-primary" onClick={()=>{setStage("deep");setIndex(0);setMode("question");}}>کشف عمیق ←</button></div>}<div className="sq-rec-head"><h3>{stage==="deep"?"سه عطر برگزیده برای پرتره کامل تو":"سه عطر نزدیک به سلیقه تو"}</h3><p>پیشنهادها الگوریتمی‌اند و تضمین پسندیدن عطر نیستند.</p></div>
      <div className="sq-recs">{result.recommendations.map((p,i)=><article key={p.id}>
        <div className="sq-rec-image"><img src={p.image} alt={"تصویر "+p.name} loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display="none";}}/><span>{i+1}</span></div>
        <div className="sq-rec-copy"><small>{p.brand}</small><h4>{p.name}</h4><p>{p.family}</p><p className="sq-rec-why">چرا به تو نزدیکه؟ هم‌خوانی با {result.dominant} و انتخاب‌های تو.</p><p className="sq-rec-notes">{p.notes?.filter(Boolean).slice(0,1).join("، ").split(/[،,]/).slice(0,3).join(" · ")}</p></div>
      </article>)}</div>
      <div className="sq-share"><div><p className="sq-kicker">YOUR STORY IS WORTH SHARING</p><h3>این قصه رو با دوستات قسمت کن.</h3><p>کارت مخصوص استوری و پست بگیر یا لینک عمومی هویت رایحه رو بفرست.</p></div>
        <div><button onClick={()=>void download("story")}>کارت استوری ↓</button><button onClick={()=>void download("post")}>کارت پست ↓</button><button className="sq-share-primary" onClick={()=>void share()}>اشتراک‌گذاری نتیجه ↗</button><button onClick={()=>void copy()}>کپی متن و لینک</button><Link href={"/scent-quest/result/"+result.archetype.slug} target="_blank">دیدن لینک اشتراک</Link><p role="status" aria-live="polite">{feedback}</p></div>
      </div>
      
      <div className="sq-join"><h3>قصه آرومان تازه شروع شده.</h3><p>دوست داری از شروع آرومان باخبر بشی؟ عضویت اختیاریه و نتیجه‌ات برای خودته.</p><Link className="sq-primary" href="/#waitlist">عضویت اختیاری در لیست دعوت ←</Link></div>
      <div className="sq-navigation sq-result-tools"><button onClick={()=>{setIndex(0);setMode("question");}}>ویرایش پاسخ‌ها</button><button onClick={()=>{setStage("quick");setIndex(0);setMode("intro");setAnswers({});setResult(null);setQuickResult(null);}}>شروع دوباره ↺</button></div>
      <p className="sq-small">لینک عمومی فقط هویت رایحه رو نشون می‌ده؛ نه جواب‌ها، پیشنهادهای دقیق یا شماره موبایل.</p>
    </section>}
  </main>;
}
