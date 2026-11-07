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
 if(s.phase==="welcome")return {text:"✦ هم‌رایحه آرومان\n\nهر رایحه یک قصه دارد؛ قصه تو چیست؟\n۷ سؤال کوتاه، نتیجه شخصی و در صورت تمایل ۸ سؤال عمیق‌تر.\nبدون شماره موبایل و ثبت‌نام.",rows:[[btn("✨ شروع کشف سریع","n:quick")],[link("آرومان",base)]],photo:"/images/hero-atelier-composite.png"};
 if(["quick","deep"].includes(s.phase)){
  const list=ids(quiz,s.phase),id=list[s.position],q=question(quiz,id);
  if(!q)throw Error("Invalid question state");
  return {text:(s.phase==="quick"?"فصل اول · کشف سریع":"فصل دوم · کشف عمیق")+"\nسؤال "+numeral(s.position+1)+" از "+numeral(list.length)+"\n\n"+q.text+"\n\nبا حس خودت انتخاب کن.",rows:[...q.options.map((o,i)=>[btn(numeral(i+1)+" · "+o.label,"a:"+id+":"+i)]),[btn("↩ بازگشت","n:back")]],photo:"/images/path-discover.jpg"};
 }
 const deep=s.phase==="deep_result",result=rankScentQuest(quiz,catalog,s.answers,deep?"deep":"quick");
 const head=(deep?"✧ پرتره عمیق رایحه تو\n۱۵ پاسخ":"✨ نتیجه اولیه رایحه تو\n۷ پاسخ")+"\n\n"+result.archetype.title+"\n"+result.archetype.subtitle+"\n\n"+result.accords.join(" · ");
 const extra=deep?"\n\nپیشنهادها پس از بررسی تمام ۱۵ پاسخ:\n"+summary(result):"\n\nسه عطر پیشنهادی:\n"+summary(result)+"\n\nاگر خواستی ۸ سؤال دیگر عمیق‌تر برو.";
 return {text:head+extra,rows:[...(deep?[]:[[btn("🔮 کشف عمیق","n:deep")]]),[btn("🎁 اشتراک نتیجه","n:share")],[link("عضویت اختیاری در لیست دعوت",base+"/#waitlist")],[btn("شروع دوباره","n:reset")]],photo:"/scent-quest/result/"+result.archetype.slug+"/opengraph-image"};
}
export function transitionSession(previous,action,deps){
 const s={phase:previous?.phase||"welcome",position:previous?.position||0,answers:{...(previous?.answers||{})}};
 const response=(changed=true)=>({session:s,changed,view:renderSession(s,deps)});
 if(action==="/forget"||action==="n:forget")return {erase:true,session:newSession(),changed:true,view:{text:"پیشرفتت حذف شد. با /start دوباره شروع کن.",rows:[]}};
 if(action==="/help"||action==="/privacy")return {session:s,changed:false,view:{text:action==="/help"?"دستورات: /start /reset /result /privacy /forget":"شناسه چت و پاسخ‌های بازی تا ۳۰ روز نگهداری می‌شود. شماره موبایل لازم نیست. برای حذف از /forget استفاده کن.",rows:[[btn("↩ برگشت","n:resume")]]}};
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
