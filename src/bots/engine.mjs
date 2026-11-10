import {rankScentQuest} from "../lib/scent-quest/scoring.ts";
import {URL} from "node:url";
const numeral=n=>new Intl.NumberFormat("fa-IR").format(n);
const btn=(text,data)=>({text,data});
const link=(text,url)=>({text,url});
export const newSession=()=>({phase:"welcome",position:0,answers:{}});
const question=(quiz,id)=>quiz.questions.find(q=>q.id===id);
const ids=(quiz,phase)=>phase==="quick"?quiz.stage1_questions:quiz.stage2_questions;
const summary=r=>r.recommendations.map((p,i)=>numeral(i+1)+". "+p.name+" — "+p.brand).join("\n");
export function renderSession(s,{quiz,catalog,siteUrl}){
 const base=(siteUrl||"https://aroman.ir").replace(/\/$/,"");
 if(s.phase==="welcome")return {
  text:"✦ هم‌رایحه آرومان\n\nهر رایحه، روایتی از توست.\nبا چند انتخاب ساده، امضای عطری خودت را پیدا کن.\n\n◦ ۷ سؤال کوتاه برای شروع\n◦ ۸ سؤال اختیاری برای شناخت عمیق‌تر\n◦ بدون شماره موبایل و ثبت‌نام\n\nآماده‌ای رایحه‌ات را کشف کنی؟",
  rows:[[btn("شروع کشف رایحه ✨","n:quick")],[link("درباره آرومان",base)]],
  photo:"/images/hero-atelier-composite.png"
 };
 if(["quick","deep"].includes(s.phase)){
  const list=ids(quiz,s.phase),id=list[s.position],q=question(quiz,id);
  if(!q)throw Error("Invalid question state");
  const heading=s.phase==="quick"?"کشف سریع":"کشف عمیق";
  const dots="●".repeat(s.position+1)+"○".repeat(list.length-s.position-1);
  return {
   text:heading+" · سؤال "+numeral(s.position+1)+" از "+numeral(list.length)+"\n"+dots+"\n\n"+q.text+"\n\nبا حس خودت انتخاب کن.",
   rows:[...q.options.map((o,i)=>[btn(numeral(i+1)+" · "+o.label,"a:"+id+":"+i)]),[btn("↩ سؤال قبل","n:back")]]
  };
 }
 const deep=s.phase==="deep_result",result=rankScentQuest(quiz,catalog,s.answers,deep?"deep":"quick");
 const head=deep?"✧ پرتره عمیق رایحه تو":"✨ نتیجه اولیه رایحه تو";
 const scope=deep?"بر اساس ۱۵ انتخاب":"بر اساس ۷ انتخاب";
 const extra=deep?"\n\nبا ۸ انتخاب تازه، تصویر کامل‌تری از سلیقه‌ات پیدا کردیم.":"\n\nاگر دوست داری، با ۸ سؤال دیگر عمیق‌تر می‌رویم.";
 return {
  text:head+"\n"+scope+"\n\n"+result.archetype.title+"\n"+result.archetype.subtitle+"\n\n🌿 حال‌وهوای رایحه\n"+result.accords.join(" · ")+"\n\n✦ سه عطر پیشنهادی\n"+summary(result)+extra,
  rows:[...(deep?[]:[[btn("🔮 کشف عمیق‌تر","n:deep")]]),[btn("🎁 اشتراک نتیجه","n:share")],[link("درباره آرومان",base)],[btn("↻ شروع دوباره","n:reset")]],
  photo:"/scent-quest/result/"+result.archetype.slug+"/opengraph-image"
 };
}
export function transitionSession(previous,action,deps){
 const s={phase:previous?.phase||"welcome",position:previous?.position||0,answers:{...(previous?.answers||{})}};
 const response=(changed=true)=>({session:s,changed,view:renderSession(s,deps)});
 if(action==="/forget"||action==="n:forget")return {erase:true,session:newSession(),changed:true,view:{text:"پیشرفتت حذف شد. ✦\nبرای یک کشف تازه، دوباره شروع کن.",rows:[[btn("✨ شروع دوباره","n:quick")]]}};
 if(action==="/help")return {session:s,changed:false,view:{text:"دستورات: /start /reset /result /privacy /forget",rows:[[btn("↩ برگشت","n:resume")]]}};
 if(action==="/privacy"||action==="n:privacy"){
  const privacyUrl=new URL("/privacy",(deps.siteUrl||"https://aroman.ir").replace(/\/$/,"")).toString();
  return {session:s,changed:false,view:{text:"حریم خصوصی ربات آرومان\n\nبرای ادامه بازی، شناسه چت و پاسخ‌های انتخابی‌ات در پایگاه داده آرومان ذخیره می‌شود؛ شماره موبایل نمی‌خواهیم. نشست پس از ۳۰ روز از آخرین به‌روزرسانی منقضی می‌شود. پیام‌های در صف، که ممکن است پیشنهادهای مبتنی بر پاسخ‌ها را داشته باشند، حداکثر ۳۰ روز نگهداری می‌شوند و پس از حداکثر ۱۰ تلاش تحویل حذف خواهند شد؛ ارسال پاسخ تضمین‌شده نیست و گاهی ممکن است تکرار شود.\n\nتلگرام یا بله، بسته به رباتی که استفاده می‌کنی، شناسه و پیام‌ها را طبق سیاست خودش پردازش می‌کند. با /forget نشست و پاسخ‌های قبلیِ صف‌شده پاک می‌شوند، اما پیام تأیید ممکن است ارسال نشود و پیامِ در حال ارسال را نمی‌توانیم پس بگیریم. این دستور نسخه‌های احتمالی پشتیبان یا داده‌های نگهداری‌شده نزد ارائه‌دهنده را پاک نمی‌کند.",rows:[[link("سیاست کامل حریم خصوصی",privacyUrl)],[btn("↩ برگشت","n:resume")]]}};
 }
 if(action==="n:reset"||action==="/reset"){const next=newSession();return {session:next,changed:true,view:renderSession(next,deps)};}
 if(["/start","/result","n:resume"].includes(action))return response(false);
 if(action==="n:quick"&&s.phase==="welcome"){s.phase="quick";return response();}
 if(action==="n:deep"&&s.phase==="quick_result"){s.phase="deep";s.position=0;return response();}
 if(action==="n:back"&&["quick","deep"].includes(s.phase)){if(s.position>0)s.position--;else if(s.phase==="deep")s.phase="quick_result";else s.phase="welcome";return response();}
 if(action==="n:share"&&["quick_result","deep_result"].includes(s.phase)){
  const r=rankScentQuest(deps.quiz,deps.catalog,s.answers,s.phase==="deep_result"?"deep":"quick");
  const url=new URL("/scent-quest/result/"+r.archetype.slug,deps.siteUrl).toString();
  return {session:s,changed:false,view:{text:"امضای رایحه من «"+r.archetype.title+"» شد! ✨\n"+url+"\nبیا امضای تو رو هم پیدا کنیم.",rows:[[link("دیدن کارت",url)],[btn("برگشت","n:resume")]],photo:"/scent-quest/result/"+r.archetype.slug+"/opengraph-image"}};
 }
 const m=/^a:(Q\d{2}):([0-3])$/.exec(action);
 if(m&&["quick","deep"].includes(s.phase)){
  const list=ids(deps.quiz,s.phase),id=list[s.position];
  if(m[1]!==id)return {session:s,changed:false,stale:true};
  const option=question(deps.quiz,id)?.options[Number(m[2])];
  if(!option||!deps.quiz.option_mappings[id]?.[option.id])return {session:s,changed:false,stale:true};
  s.answers[id]=option.id;
  if(s.position+1===list.length){s.phase=s.phase==="quick"?"quick_result":"deep_result";s.position=0;}
  else s.position++;
  return response();
 }
 return {session:s,changed:false,stale:true};
}
