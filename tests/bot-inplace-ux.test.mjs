import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { BotApi } from "../src/bots/bot-api.mjs";
import { processPolledUpdate } from "../src/bots/runtime.mjs";
import { transitionSession } from "../src/bots/engine.mjs";

const quiz=JSON.parse(readFileSync(new URL("../src/lib/scent-quest/quiz-data.json",import.meta.url),"utf8"));
const catalog=JSON.parse(readFileSync(new URL("../public/data/scent-quest-perfumes.json",import.meta.url),"utf8"));
const deps={quiz,catalog,siteUrl:"https://aroman.ir"};

test("callback answer queues a replacement of its source text message, not a new bubble",async()=>{
  let state={phase:"quick",position:0,answers:{}};
  let queued,cleared=0,acked=0;
  const store={applyUpdate:async(_platform,_updateId,fn)=>fn({
    get:async()=>state,
    put:async(_platform,_chat,s)=>{state=s;},
    enqueue:async(_chat,view)=>{queued=view;return true;}
  })};
  const api={acknowledge:async()=>{acked++;},clearButtons:async()=>{cleared++;}};
  const result=await processPolledUpdate({
    platform:"telegram",updateId:21,store,api,engineConfig:deps,
    update:{callback_query:{id:"test",data:"a:"+quiz.stage1_questions[0]+":0,
      message:{chat:{id:5,type:"private"},message_id:32,text:"Old question"}}}
  });
  assert.equal(result.duplicate,false);
  assert.equal(state.position,1);
  assert.deepEqual(queued.editTarget,{messageId:32,kind:"text"});
  assert.match(queued.text,/سؤال/);
  assert.equal(acked,1);
  assert.equal(cleared,0);
});

test("last quick answer replaces its question with the actual quick result",async()=>{
  const last=quiz.stage1_questions.at(-1);
  let state={phase:"quick",position:quiz.stage1_questions.length-1,answers:{}};
  for(const id of quiz.stage1_questions.slice(0,-1)){
    const q=quiz.questions.find(q=>q.id===id);
    state.answers[id]=q.options[0].id;
  }
  const queued=[];
  const store={applyUpdate:async(_platform,_id,fn)=>fn({
    get:async()=>state,
    put:async(_provider,_chat,s)=>{state=s;},
    enqueue:async(_chat,view)=>{queued.push(view);return true;}
  })};
  const api={acknowledge:async()=>{},clearButtons:async()=>{throw Error("Should not clear buttons before edit");}};
  await processPolledUpdate({platform:"bale",updateId:99,store,api,engineConfig:deps,
    update:{callback_query:{id:"end",data:"a:"+last+":0",message:{
      chat:{id:12,type:"private"},message_id:19,photo:[{file_id:"illustration"}]}}}});
  assert.equal(state.phase,"quick_result");
  assert.equal(queued.length,1);
  assert.deepEqual(queued[0].editTarget,{messageId:19,kind:"photo"});
  assert.match(queued[0].text,/نتیجه اولیه/);
});

test("both providers edit text and photo captions using the original message ID",async()=>{
  for(const platform of ["telegram","bale"]){
    const requests=[];
    const fetchImpl=async(url,options)=>{
      requests.push({method:new URL(url).pathname.split("/").at(-1),payload:JSON.parse(options.body)});
      return {ok:true,status:200,json:async()=>({ok:true,result:true})};
    };
    const api=new BotApi({platform,token:"TEST",fetchImpl});
    await api.deliverView("10",{text:"Next question",rows:[],editTarget:{messageId:99,kind:"text"}});
    await api.deliverView("10",{text:"Next caption",rows:[],editTarget:{messageId:98,kind:"photo"}});
    assert.deepEqual(requests.map(x=>x.method),["editMessageText","editMessageCaption"]);
    assert.equal(requests[0].payload.message_id,99);
    assert.equal(requests[1].payload.message_id,98);
    assert.equal(requests[1].payload.caption,"Next caption");
  }
});

test("definitive provider edit rejection sends new content then deletes the old question",async()=>{
  for(const platform of ["telegram","bale"]){
    const calls=[];
    const api=new BotApi({platform,token:"TEST",fetchImpl:async(url)=>{
      const method=new URL(url).pathname.split("/").at(-1);
      calls.push(method);
      if(method==="editMessageText")return {ok:false,status:400,json:async()=>({ok:false,description:"Message cannot be edited"})};
      return {ok:true,status:200,json:async()=>({ok:true,result:true})};
    }});
    await api.deliverView("10",{text:"New question",rows:[],editTarget:{messageId:1,kind:"text"}});
    assert.deepEqual(calls,["editMessageText","sendMessage","deleteMessage"]);
  }
});

test("ambiguous edit failure is retried, not followed by a duplicate send",async()=>{
  const calls=[];
  const api=new BotApi({platform:"telegram",token:"SECRET_TOKEN",fetchImpl:async(url)=>{
    calls.push(new URL(url).pathname.split("/").at(-1));
    throw Error("Connection dropped");
  }});
  await assert.rejects(api.deliverView("PRIVATE_CHAT",{text:"sensitive text",rows:[],
    editTarget:{messageId:2,kind:"text"}}),error=>{
    assert.match(error.message,/delivery may be unknown/);
    assert.doesNotMatch(error.message,/SECRET_TOKEN|PRIVATE_CHAT|sensitive text/);
    return true;
  });
  assert.deepEqual(calls,["editMessageText"]);
});

test("an already-applied edit is treated as idempotent on delivery retry",async()=>{
  const calls=[];
  const api=new BotApi({platform:"bale",token:"TEST",fetchImpl:async(url)=>{
    calls.push(new URL(url).pathname.split("/").at(-1));
    return {ok:false,status:400,json:async()=>({ok:false,description:"Bad Request: message is not modified"})};
  }});
  await api.deliverView("20",{text:"Already applied",rows:[],
    editTarget:{messageId:5,kind:"text"}});
  assert.deepEqual(calls,["editMessageText"]);
});

test("bot presentation removes disabled waitlist CTA, keeps actual 7 plus 8 quiz",()=>{
  const welcome=transitionSession(null,"/start",deps).view;
  assert.match(welcome.text,/هم‌رایحه آرومان/);
  const first=transitionSession(null,"/reset",deps).session;
  const question=transitionSession(first,"n:quick",deps).view;
  assert.match(question.text,/◆/);
  assert.match(question.text,/سؤال/);
  let state=transitionSession(first,"n:quick",deps).session;
  for(const id of quiz.stage1_questions)state=transitionSession(state,"a:"+id+":0",deps).session;
  const result=transitionSession(state,"/result",deps).view;
  assert.doesNotMatch(JSON.stringify(result),/waitlist|لیست دعوت/);
  assert.match(result.text,/نتیجه اولیه/);
});
