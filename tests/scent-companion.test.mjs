import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {URL} from "node:url";
import {newSession,transitionSession} from "../src/bots/engine.mjs";
import {processUpdate,parseUpdate} from "../src/bots/runtime.mjs";
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
});
test("forget clears answers and resume preserves state",()=>{
 let s=transitionSession(newSession(),"n:quick",deps).session;
 s=transitionSession(s,"a:Q09:0",deps).session;
 assert.equal(transitionSession(s,"/start",deps).session.position,1);
 const erased=transitionSession(s,"/forget",deps);
 assert.equal(erased.erase,true);assert.deepEqual(erased.session.answers,{});
});
test("group chat ignored and callback normalized",()=>{
 assert.equal(parseUpdate({message:{chat:{id:1,type:"group"},text:"/start"}}),null);
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
test("both platform adapters send consistent callback buttons",async()=>{
 const requests=[];const fetchImpl=async(url,options)=>{requests.push([url,JSON.parse(options.body)]);return {ok:true,status:200,json:async()=>({ok:true,result:true})};};
 for(const platform of ["telegram","bale"])await new BotApi({platform,token:"TEST",fetchImpl}).sendMessage(1,{text:"شروع",rows:[[{text:"شروع",data:"n:quick"}]]});
 assert.match(requests[0][0],/api.telegram.org/);assert.match(requests[1][0],/tapi.bale.ai/);
 assert.equal(requests[1][1].reply_markup.inline_keyboard[0][0].callback_data,"n:quick");
});
