import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { BotApi } from "../src/bots/bot-api.mjs";
import { newSession, transitionSession } from "../src/bots/engine.mjs";
import { parseUpdate, processPolledUpdate } from "../src/bots/runtime.mjs";

const quiz=JSON.parse(readFileSync(new URL("../src/lib/scent-quest/quiz-data.json",import.meta.url),"utf8"));
const catalog=JSON.parse(readFileSync(new URL("../public/data/scent-quest-perfumes.json",import.meta.url),"utf8"));
const deps={quiz,catalog,siteUrl:"https://aroman.ir"};

function callback(action,messageId=42,photo=false) {
  return {callback_query:{id:"callback-1",data:action,message:{
    chat:{id:1234,type:"private"},message_id:messageId,...(photo?{photo:[{file_id:"test"}]}:{text:"prior screen"})
  }}};
}
function fakeApi(platform,respond) {
  const calls=[];
  const fetchImpl=async(url,options)=>{
    const method=new URL(url).pathname.split("/").pop();
    calls.push({method,body:JSON.parse(options.body)});
    return respond?respond(method):{ok:true,status:200,json:async()=>({ok:true,result:true})};
  };
  return {api:new BotApi({platform,token:"synthetic-token",fetchImpl}),calls};
}

test("every quick and deep answer advances the formatted progress without changing scoring",()=>{
  let state=transitionSession(newSession(),"n:quick",deps).session;
  for(let i=0;i<quiz.stage1_questions.length;i++) {
    const view=transitionSession(state,"/result",deps).view;
    assert.match(view.text,new RegExp("سؤال "+new Intl.NumberFormat("fa-IR").format(i+1)));
    assert.equal((view.text.match(/●/g)||[]).length,i+1);
    state=transitionSession(state,"a:"+quiz.stage1_questions[i]+":0",deps).session;
  }
  assert.equal(state.phase,"quick_result");
  assert.match(transitionSession(state,"/result",deps).view.text,/نتیجه اولیه/);
  state=transitionSession(state,"n:deep",deps).session;
  for(const id of quiz.stage2_questions)state=transitionSession(state,"a:"+id+":0",deps).session;
  assert.equal(state.phase,"deep_result");
  assert.match(transitionSession(state,"/result",deps).view.text,/پرتره عمیق/);
  assert.equal(Object.keys(state.answers).length,15);
});
test("welcome and result do not advertise the disabled waitlist",()=>{
  const welcome=transitionSession(newSession(),"/start",deps).view;
  assert.match(welcome.text,/۷ سؤال کوتاه/);
  assert.equal(welcome.rows.some(row=>row.some(b=>String(b.url||"").includes("#waitlist"))),false);
  let state=transitionSession(newSession(),"n:quick",deps).session;
  for(const id of quiz.stage1_questions)state=transitionSession(state,"a:"+id+":0",deps).session;
  const result=transitionSession(state,"/result",deps).view;
  assert.equal(result.rows.some(row=>row.some(b=>String(b.url||"").includes("#waitlist"))),false);
});

for(const platform of ["telegram","bale"]) {
  test(platform+": callback on text message edits one existing question",async()=>{
    const {api,calls}=fakeApi(platform);
    await api.sendMessage("1234",{text:"Next question",rows:[[{text:"Option",data:"a:Q09:0"}]],editTarget:{messageId:42,kind:"text"}});
    assert.deepEqual(calls.map(call=>call.method),["editMessageText"]);
    assert.equal(calls[0].body.message_id,42);
    assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].callback_data,"a:Q09:0");
  });
  test(platform+": callback on photo edits caption in place",async()=>{
    const {api,calls}=fakeApi(platform);
    await api.sendMessage("1234",{text:"Next question",rows:[],photo:"/same.jpg",reusePhoto:true,editTarget:{messageId:42,kind:"photo"}},"https://aroman.ir");
    assert.deepEqual(calls.map(call=>call.method),["editMessageCaption"]);
    assert.equal(calls[0].body.message_id,42);
  });
  test(platform+": definitive edit rejection replaces message once",async()=>{
    const {api,calls}=fakeApi(platform,async(method)=>({
      ok:method!=="editMessageText",status:method==="editMessageText"?400:200,
      json:async()=>method==="editMessageText"?{ok:false,description:"message can't be edited"}:{ok:true,result:true}
    }));
    await api.sendMessage("1234",{text:"Next",rows:[],editTarget:{messageId:42,kind:"text"}});
    assert.deepEqual(calls.map(call=>call.method),["editMessageText","sendMessage","deleteMessage"]);
  });
  test(platform+": ambiguous edit failure never sends a duplicate message",async()=>{
    const {api,calls}=fakeApi(platform,async()=>{throw Error("connection lost");});
    await assert.rejects(api.sendMessage("1234",{text:"private response",rows:[],editTarget:{messageId:42,kind:"text"}}),/delivery may be unknown/);
    assert.deepEqual(calls.map(call=>call.method),["editMessageText"]);
  });
  test(platform+": already-edited retry is treated as success",async()=>{
    const {api,calls}=fakeApi(platform,async()=>({
      ok:false,status:400,json:async()=>({ok:false,description:"Bad Request: message is not modified"})
    }));
    await api.sendMessage("1234",{text:"Next",rows:[],editTarget:{messageId:42,kind:"text"}});
    assert.deepEqual(calls.map(call=>call.method),["editMessageText"]);
  });
}

test("polled callback persists edit target atomically and never clears fresh question buttons",async()=>{
  let state=newSession(),queued,ackCount=0,cleared=0;
  const store={
    applyUpdate:async(_platform,_id,operation)=>operation({
      get:async()=>state,
      put:async(_provider,_chat,next)=>{state=next;},
      forget:async()=>{state=null;},
      enqueue:async(_chat,view)=>{queued=view;return true;}
    })
  };
  const api={acknowledge:async()=>{ackCount++;},clearButtons:async()=>{cleared++;}};
  await processPolledUpdate({platform:"telegram",updateId:1,update:callback("n:quick"),store,api,engineConfig:deps});
  assert.equal(state.phase,"quick");
  assert.deepEqual(queued.editTarget,{messageId:42,kind:"text"});
  assert.equal(ackCount,1);
  assert.equal(cleared,0);
});

test("a photo callback persists a caption edit target and stale callbacks do not enqueue",async()=>{
  assert.equal(parseUpdate(callback("n:quick",44,true)).messageKind,"photo");
  let state=transitionSession(newSession(),"n:quick",deps).session,queued=[];
  const store={applyUpdate:async(_p,_id,operation)=>operation({
    get:async()=>state,
    put:async(_p,_c,s)=>{state=s;},
    forget:async()=>{state=null;},
    enqueue:async(_c,view)=>{queued.push(view);return true;}
  })};
  const api={acknowledge:async()=>{},clearButtons:async()=>{}};
  await processPolledUpdate({platform:"bale",updateId:5,update:callback("a:Q09:1",44,true),store,api,engineConfig:deps});
  assert.deepEqual(queued[0].editTarget,{messageId:44,kind:"photo"});
  await processPolledUpdate({platform:"bale",updateId:6,update:callback("a:Q09:1",44,true),store,api,engineConfig:deps});
  assert.equal(queued.length,1);
});


test("last answer in each stage replaces the final question with its result",async()=>{
  const deliver=async(state,lastQuestionId,expectedPhase)=>{
    let queued;
    const store={applyUpdate:async(_platform,_updateId,operation)=>operation({
      get:async()=>state,
      put:async(_provider,_chat,next)=>{state=next;},
      forget:async()=>{state=null;},
      enqueue:async(_chat,view)=>{queued=view;return true;}
    })};
    const api={acknowledge:async()=>{},clearButtons:async()=>{throw Error("must not clear new buttons");}};
    await processPolledUpdate({
      platform:"bale",updateId:79,update:callback("a:"+lastQuestionId+":0",79),
      store,api,engineConfig:deps
    });
    assert.equal(state.phase,expectedPhase);
    assert.deepEqual(queued.editTarget,{messageId:79,kind:"text"});
    assert.ok(queued.rows.length>0,"result actions should be displayed");
    assert.match(queued.text,expectedPhase==="quick_result"?/نتیجه اولیه/:/پرتره عمیق/);
    return state;
  };
  let s=transitionSession(newSession(),"n:quick",deps).session;
  for(const id of quiz.stage1_questions.slice(0,-1))s=transitionSession(s,"a:"+id+":0",deps).session;
  s=await deliver(s,quiz.stage1_questions.at(-1),"quick_result");
  s=transitionSession(s,"n:deep",deps).session;
  for(const id of quiz.stage2_questions.slice(0,-1))s=transitionSession(s,"a:"+id+":0",deps).session;
  await deliver(s,quiz.stage2_questions.at(-1),"deep_result");
});

test("share callback keeps the original result rather than overwriting it",async()=>{
  let state=transitionSession(newSession(),"n:quick",deps).session;
  for(const id of quiz.stage1_questions)state=transitionSession(state,"a:"+id+":0",deps).session;
  let queued;
  const store={applyUpdate:async(_p,_id,fn)=>fn({
    get:async()=>state,put:async(_p,_chat,s)=>{state=s;},
    forget:async()=>{state=null;},
    enqueue:async(_chat,view)=>{queued=view;return true;}
  })};
  const api={acknowledge:async()=>{},clearButtons:async()=>{}};
  await processPolledUpdate({platform:"telegram",updateId:201,update:callback("n:share"),store,api,engineConfig:deps});
  assert.equal(state.phase,"quick_result");
  assert.equal(queued.editTarget,undefined);
  assert.match(queued.text,/aroman\.ir/);
});

for(const platform of ["telegram","bale"]) {
  test(platform+": confirmed replacement is delivered before removing the old question",async()=>{
    const {api,calls}=fakeApi(platform,async(method)=>{
      if(method==="editMessageText")return {ok:false,status:400,json:async()=>({ok:false,description:"cannot edit"})};
      return {ok:true,status:200,json:async()=>({ok:true,result:true})};
    });
    await api.sendMessage("1234",{text:"New question",rows:[],editTarget:{messageId:42,kind:"text"}});
    assert.deepEqual(calls.map(call=>call.method),["editMessageText","sendMessage","deleteMessage"]);
  });
  test(platform+": failed replacement does not remove the original buttons",async()=>{
    const {api,calls}=fakeApi(platform,async(method)=>{
      if(method==="editMessageText")return {ok:false,status:400,json:async()=>({ok:false,description:"cannot edit"})};
      return {ok:false,status:503,json:async()=>({ok:false})};
    });
    await assert.rejects(api.sendMessage("1234",{text:"New question",rows:[],
      editTarget:{messageId:42,kind:"text"}}),/API failure 503/);
    assert.deepEqual(calls.map(call=>call.method),["editMessageText","sendMessage"]);
  });
  test(platform+": rate-limited edit does not trigger a second message",async()=>{
    const {api,calls}=fakeApi(platform,async()=>({
      ok:false,status:429,json:async()=>({ok:false,description:"Too Many Requests"})
    }));
    await assert.rejects(api.sendMessage("1234",{text:"New",rows:[],
      editTarget:{messageId:42,kind:"text"}}),/API failure 429/);
    assert.deepEqual(calls.map(call=>call.method),["editMessageText"]);
  });
}

test("questions render as text-only while welcome/results may request images",()=>{
  const welcome=transitionSession(newSession(),"/start",deps).view;
  assert.ok(welcome.photo,"welcome artwork is optional");
  let state=transitionSession(newSession(),"n:quick",deps).session;
  for(let index=0;index<quiz.stage1_questions.length;index++){
    const view=transitionSession(state,"/result",deps).view;
    assert.equal(view.photo,undefined,"question should not request a photo");
    state=transitionSession(state,"a:"+quiz.stage1_questions[index]+":0",deps).session;
  }
  const result=transitionSession(state,"/result",deps).view;
  assert.ok(result.photo,"result artwork is optional");
});

for(const platform of ["telegram","bale"]) {
  test(platform+": welcome photo to text question sends text then deletes old photo",async()=>{
    const {api,calls}=fakeApi(platform);
    await api.sendMessage("1234",{text:"Question 1",rows:[[{text:"A",data:"a:Q09:0"}]],editTarget:{messageId:31,kind:"photo"}},"https://aroman.ir");
    assert.deepEqual(calls.map(c=>c.method),["sendMessage","deleteMessage"]);
    assert.equal(calls[1].body.message_id,31);
  });
  test(platform+": final text question to result image sends photo then deletes question",async()=>{
    const {api,calls}=fakeApi(platform);
    await api.sendMessage("1234",{text:"Result",photo:"/scent-quest/result/example/opengraph-image",rows:[],editTarget:{messageId:99,kind:"text"}},"https://aroman.ir");
    assert.deepEqual(calls.map(c=>c.method),["sendPhoto","deleteMessage"]);
    assert.equal(calls[1].body.message_id,99);
  });
  test(platform+": absent image origin keeps final result as one text edit",async()=>{
    const {api,calls}=fakeApi(platform);
    await api.sendMessage("1234",{text:"Result",photo:"/result.jpg",rows:[],editTarget:{messageId:99,kind:"text"}},"");
    assert.deepEqual(calls.map(c=>c.method),["editMessageText"]);
  });
  test(platform+": failed image send retains the old question until new text is delivered",async()=>{
    const {api,calls}=fakeApi(platform,async(method)=>({
      ok:method!=="sendPhoto",status:method==="sendPhoto"?400:200,
      json:async()=>method==="sendPhoto"?{ok:false,description:"Photo URL rejected"}:{ok:true,result:true}
    }));
    await api.sendMessage("1234",{text:"Result",photo:"/bad.jpg",rows:[],editTarget:{messageId:99,kind:"text"}},"https://aroman.ir");
    assert.deepEqual(calls.map(c=>c.method),["sendPhoto","sendMessage","deleteMessage"]);
  });
  test(platform+": ambiguous image send never deletes old question or emits text duplicate",async()=>{
    const {api,calls}=fakeApi(platform,async()=>{throw Error("Connection dropped");});
    await assert.rejects(api.sendMessage("1234",{text:"Result",photo:"/ok.jpg",rows:[],
      editTarget:{messageId:99,kind:"text"}},"https://aroman.ir"),/delivery may be unknown/);
    assert.deepEqual(calls.map(c=>c.method),["sendPhoto"]);
  });
}
