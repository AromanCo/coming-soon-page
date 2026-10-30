import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {URL} from "node:url";
import {newSession,transitionSession} from "../src/bots/engine.mjs";
import {processUpdate,processPolledUpdate,parseUpdate} from "../src/bots/runtime.mjs";
import {BotApi} from "../src/bots/bot-api.mjs";
const quiz=JSON.parse(readFileSync(new URL("../src/lib/scent-quest/quiz-data.json",import.meta.url),"utf8"));
const catalog=JSON.parse(readFileSync(new URL("../public/data/scent-quest-perfumes.json",import.meta.url),"utf8"));
const deps={quiz,catalog,siteUrl:"https://aroman.ir"};
test("7 + 8 answers advance into distinct results",()=>{
 let s=transitionSession(newSession(),"n:quick",deps).session;
 for(const id of quiz.stage1_questions)s=transitionSession(s,"a:"+id+":0",deps).session;
 assert.equal(s.phase,"quick_result");
 assert.match(transitionSession(s,"/result",deps).view.text,/نتیجه اولیه/);
 s=transitionSession(s,"n:deep",deps).session;
 for(const id of quiz.stage2_questions)s=transitionSession(s,"a:"+id+":1",deps).session;
 assert.equal(s.phase,"deep_result");assert.equal(Object.keys(s.answers).length,15);
 assert.match(transitionSession(s,"/result",deps).view.text,/پرتره عمیق/);
});
test("stale buttons and invalid options do not change current state",()=>{
 const s=transitionSession(newSession(),"n:quick",deps).session;
 assert.equal(transitionSession(s,"a:Q11:2",deps).stale,true);
 assert.equal(transitionSession(s,"a:Q09:9",deps).stale,true);
 assert.equal(transitionSession(newSession(),"n:deep",deps).stale,true);
 assert.equal(transitionSession(s,"n:unknown",deps).stale,true);
});
test("forget clears answers and resume preserves state",()=>{
 let s=transitionSession(newSession(),"n:quick",deps).session;
 s=transitionSession(s,"a:Q09:0",deps).session;
 assert.equal(transitionSession(s,"/start",deps).session.position,1);
 const erased=transitionSession(s,"/forget",deps);
 assert.equal(erased.erase,true);assert.deepEqual(erased.session.answers,{});
});
test("back, reset, and sharing preserve the intended session boundaries",()=>{
 let s=transitionSession(newSession(),"n:quick",deps).session;
 s=transitionSession(s,"a:Q09:0",deps).session;
 s=transitionSession(s,"n:back",deps).session;
 assert.equal(s.phase,"quick");assert.equal(s.position,0);
 s=transitionSession(s,"n:quick",deps).session;
 for(const id of quiz.stage1_questions)s=transitionSession(s,"a:"+id+":0",deps).session;
 const shared=transitionSession(s,"n:share",deps);
 assert.equal(shared.session.phase,"quick_result");
 assert.match(shared.view.text,/aroman\.ir\/scent-quest\/result\//);
 s=transitionSession(s,"n:deep",deps).session;
 s=transitionSession(s,"n:back",deps).session;
 assert.equal(s.phase,"quick_result");
 const reset=transitionSession(s,"n:reset",deps).session;
 assert.equal(reset.phase,"welcome");assert.deepEqual(reset.answers,{});
});
test("group chat ignored and callback normalized",()=>{
 assert.equal(parseUpdate({message:{chat:{id:1,type:"group"},text:"/start"}}),null);
 assert.equal(parseUpdate({callback_query:{id:"x",data:"n:quick",message:{chat:{id:1,type:"group"},message_id:3}}}),null);
 assert.equal(parseUpdate({callback_query:{id:"x",data:"n:quick",message:{chat:{id:1,type:"private"},message_id:3}}}).action,"n:quick");
});
test("stateful runtime persists private chat and handles callbacks",async()=>{
 let state=null;const sent=[];
 const store={get:async()=>state,put:async(_,__,s)=>{state=s;},forget:async()=>{state=null;}};
 const api={sendMessage:async(_,view)=>sent.push(view.text),acknowledge:async()=>{},clearButtons:async()=>{}};
 await processUpdate({platform:"telegram",update:{message:{chat:{id:1,type:"private"},text:"/start"}},api,store,engineConfig:deps});
 await processUpdate({platform:"telegram",update:{callback_query:{id:"x",data:"n:quick",message:{chat:{id:1,type:"private"},message_id:1}}},api,store,engineConfig:deps});
 assert.equal(state.phase,"quick");assert.equal(sent.length,2);
});
test("forget command deletes persisted state",async()=>{
 let state={phase:"quick",position:2,answers:{Q09:"الف"}};let deleted=false;
 const store={get:async()=>state,put:async(_,__,s)=>{state=s;},forget:async()=>{state=null;deleted=true;}};
 const api={sendMessage:async(_,view)=>assert.match(view.text,/حذف شد/),acknowledge:async()=>{},clearButtons:async()=>{}};
 await processUpdate({platform:"bale",update:{message:{chat:{id:2,type:"private"},text:"/forget"}},api,store,engineConfig:deps});
 assert.equal(deleted,true);assert.equal(state,null);
});
test("polled updates persist a delivery instead of sending before commit",async()=>{
 let state=newSession();let queued=[];let sends=0;
 const store={applyUpdate:async(_platform,_id,operation)=>operation({
  get:async()=>state,
  put:async(_provider,_chat,session)=>{state=session;},
  forget:async()=>{state=null;},
  enqueue:async(chatId,view,origin)=>queued.push({chatId,view,origin}),
 })};
 const api={sendMessage:async()=>{sends++;},acknowledge:async()=>{},clearButtons:async()=>{}};
 await processPolledUpdate({platform:"telegram",updateId:1,update:{callback_query:{id:"x",data:"n:quick",message:{chat:{id:1,type:"private"},message_id:4}}},store,api,engineConfig:deps});
 assert.equal(state.phase,"quick");assert.equal(queued.length,1);assert.equal(sends,0);
 assert.match(queued[0].view.text,/سؤال/);
});
test("both platform adapters send consistent callback buttons",async()=>{
 const requests=[];const fetchImpl=async(url,options)=>{requests.push([url,JSON.parse(options.body)]);return {ok:true,status:200,json:async()=>({ok:true,result:true})};};
 for(const platform of ["telegram","bale"])await new BotApi({platform,token:"TEST",fetchImpl}).sendMessage(1,{text:"شروع",rows:[[{text:"شروع",data:"n:quick"}]]});
 assert.match(requests[0][0],/api.telegram.org/);assert.match(requests[1][0],/tapi.bale.ai/);
 assert.equal(requests[1][1].reply_markup.inline_keyboard[0][0].callback_data,"n:quick");
});
test("both adapters fall back after a definitive media rejection",async()=>{
 for(const platform of ["telegram","bale"]){
  const methods=[];
  const fetchImpl=async(url)=>{
   const method=new URL(url).pathname.split("/").pop();methods.push(method);
   const rejected=method==="sendPhoto";
   return {ok:true,status:200,json:async()=>rejected?{ok:false}:{ok:true,result:true}};
  };
  await new BotApi({platform,token:"TEST",fetchImpl}).sendMessage("42",{text:"test",rows:[],photo:"/x.png"},"https://aroman.ir");
  assert.deepEqual(methods,["sendPhoto","sendMessage"]);
 }
});
test("ambiguous media failure is retried without an unsafe text fallback",async()=>{
 let calls=0;
 const api=new BotApi({platform:"telegram",token:"SENSITIVE_TEST_TOKEN",fetchImpl:async()=>{calls++;throw Error("socket closed");}});
 await assert.rejects(api.sendMessage("987654321",{text:"private answer",rows:[],photo:"/x.png"},"https://aroman.ir"),error=>{
  assert.doesNotMatch(error.message,/SENSITIVE_TEST_TOKEN|987654321|private answer/);
  return /delivery may be unknown/.test(error.message);
 });
 assert.equal(calls,1);
});
test("provider API failures omit credentials, chat IDs, and message content",async()=>{
 for(const platform of ["telegram","bale"]){
  const api=new BotApi({platform,token:"PRIVATE_TOKEN",fetchImpl:async()=>({ok:false,status:503,json:async()=>({ok:false})})});
  await assert.rejects(api.sendMessage("1122334455",{text:"quiz answer",rows:[]}),error=>{
   assert.match(error.message,/API failure 503/);
   assert.doesNotMatch(error.message,/PRIVATE_TOKEN|1122334455|quiz answer/);
   return true;
  });
 }
});
