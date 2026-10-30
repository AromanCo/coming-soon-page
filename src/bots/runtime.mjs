import {transitionSession} from "./engine.mjs";

export function parseUpdate(update){
 const c=update?.callback_query;
 if(c){if(c.message?.chat?.type!=="private"||!c.message.chat.id||typeof c.data!=="string")return null;
 return {chatId:String(c.message.chat.id),action:c.data,callbackId:c.id,messageId:c.message.message_id};}
 const m=update?.message;
 if(!m?.chat?.id||m.chat.type!=="private")return null;
 const command=String(m.text??"").trim().split(/[\s@]/)[0];
 return {chatId:String(m.chat.id),action:["/start","/reset","/forget","/help","/privacy","/result"].includes(command)?command:"/start"};
}

async function makePlan({platform,update,store,engineConfig,mediaOrigin=""}){
 const event=parseUpdate(update);if(!event)return {ignored:true};
 const state=await store.get(platform,event.chatId);
 const outcome=transitionSession(state,event.action,engineConfig);
 if(outcome.erase)await store.forget(platform,event.chatId);
 else if(outcome.changed)await store.put(platform,event.chatId,outcome.session);
 return {ignored:Boolean(outcome.stale),stale:Boolean(outcome.stale),event,outcome,mediaOrigin};
}

export async function finishUpdate(plan,api){
 if(!plan?.event)return;
 const {event,outcome}=plan;
 if(event.callbackId)try{await api.acknowledge(event.callbackId,outcome.stale?"این دکمه قدیمی شده 🌿":"");}catch{/* Callback acknowledgement is best effort. */}
 if(event.callbackId&&outcome.changed&&event.messageId)try{await api.clearButtons(event.chatId,event.messageId);}catch{/* Stale buttons are rejected against persisted state. */}
}

/** Test/helper path for non-polling callers. Production polling uses the durable outbox path. */
export async function processUpdate(args){
 const plan=await makePlan(args);
 if(plan.outcome?.view)await args.api.sendMessage(plan.event.chatId,plan.outcome.view,plan.mediaOrigin);
 await finishUpdate(plan,args.api);
 return {ignored:plan.ignored,stale:plan.stale};
}

/** Atomically persist update effects and cursor before delivery through the durable outbox. */
export async function processPolledUpdate({platform,update,updateId,store,engineConfig,mediaOrigin="",api}){
 const plan=await store.applyUpdate(platform,updateId,async tx=>{
  const next=await makePlan({platform,update,store:tx,engineConfig,mediaOrigin});
  if(next.outcome?.view)await tx.enqueue(next.event.chatId,next.outcome.view,mediaOrigin);
  return next;
 });
 if(plan?.duplicate)return {duplicate:true,ignored:true};
 await finishUpdate(plan,api);
 return {duplicate:false,ignored:plan.ignored,stale:plan.stale};
}
