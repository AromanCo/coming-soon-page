import {transitionSession} from "./engine.mjs";

export function parseUpdate(update){
 const c=update?.callback_query;
 if(c){if(c.message?.chat?.type!=="private"||!c.message.chat.id||typeof c.data!=="string")return null;
 return {chatId:String(c.message.chat.id),action:c.data,callbackId:c.id,messageId:c.message.message_id,
  messageKind:Array.isArray(c.message.photo)&&c.message.photo.length?"photo":typeof c.message.text==="string"?"text":"other"};}
 const m=update?.message;
 if(!m?.chat?.id||m.chat.type!=="private")return null;
 const command=String(m.text??"").trim().split(/[\s@]/)[0];
 return {chatId:String(m.chat.id),action:["/start","/reset","/forget","/help","/privacy","/result"].includes(command)?command:"/start"};
}

export function orderUpdates(updates){
 return [...updates].sort((left,right)=>left.update_id-right.update_id);
}

async function makePlan({platform,update,store,engineConfig,mediaOrigin=""}){
 const event=parseUpdate(update);if(!event)return {ignored:true};
 const state=await store.get(platform,event.chatId);
 const outcome=transitionSession(state,event.action,engineConfig);
 return {ignored:Boolean(outcome.stale),stale:Boolean(outcome.stale),event,outcome,mediaOrigin};
}

export async function finishUpdate(plan,api){
 if(!plan?.event)return;
 const {event,outcome}=plan;
 if(event.callbackId)try{await api.acknowledge(event.callbackId,outcome.stale?"این دکمه قدیمی شده 🌿":"");}catch{/* Callback acknowledgement is best effort. */}
 if(event.callbackId&&outcome.changed&&event.messageId&&!plan.editInPlace&&!plan.queueFull)try{await api.clearButtons(event.chatId,event.messageId);}catch{/* Stale buttons are rejected against persisted state. */}
}

/** Test/helper path for non-polling callers. Production polling uses the durable outbox path. */
export async function processUpdate(args){
 const plan=await makePlan(args);
 if(plan.outcome?.erase)await args.store.forget(args.platform,plan.event.chatId);
 else if(plan.outcome?.changed)await args.store.put(args.platform,plan.event.chatId,plan.outcome.session);
 if(plan.outcome?.view)await args.api.sendMessage(plan.event.chatId,plan.outcome.view,plan.mediaOrigin);
 await finishUpdate(plan,args.api);
 return {ignored:plan.ignored,stale:plan.stale};
}

/** Atomically persist update effects and cursor before delivery through the durable outbox. */
export async function processPolledUpdate({platform,update,updateId,store,engineConfig,mediaOrigin="",api}){
 const plan=await store.applyUpdate(platform,updateId,async tx=>{
  const next=await makePlan({platform,update,store:tx,engineConfig,mediaOrigin});
  if(!next.event)return next;
  if(next.outcome.erase){
   await tx.forget(platform,next.event.chatId);
   const responseQueued=await tx.enqueueControl(next.event.chatId,next.outcome.view,mediaOrigin,"forget_confirmation");
   return {...next,responseQueued};
  }
  let editInPlace=false;
  if(next.outcome.view){
   // Persist the target with the queued response so editing happens after the
   // same transaction that commits the answer and polling offset.
   // Do not edit share/help/privacy responses that did not change quiz state.
   editInPlace=Boolean(next.event.callbackId&&next.outcome.changed&&
     Number.isSafeInteger(next.event.messageId)&&next.event.messageId>0&&
     ["text","photo"].includes(next.event.messageKind));
   const view=editInPlace?
     {...next.outcome.view,editTarget:{messageId:next.event.messageId,kind:next.event.messageKind}}:
     next.outcome.view;
   const responseQueued=await tx.enqueue(next.event.chatId,view,mediaOrigin);
   if(!responseQueued){
    const busyView={text:"سرویس موقتاً شلوغ است؛ کمی بعد دوباره تلاش کن.",rows:[]};
    const busyQueued=next.event.callbackId?false:await tx.enqueueControl(next.event.chatId,busyView,mediaOrigin,"busy");
    return {...next,queueFull:true,responseQueued:false,busyQueued};
   }
  }
  if(next.outcome.changed)await tx.put(platform,next.event.chatId,next.outcome.session);
  return {...next,responseQueued:true,editInPlace};
 });
 if(plan?.duplicate)return {duplicate:true,ignored:true};
 if(plan?.queueFull&&plan.event?.callbackId)try{await api.acknowledge(plan.event.callbackId,"سرویس موقتاً شلوغ است؛ دوباره تلاش کن.");}catch{/* Callback acknowledgement is best effort. */}
 else await finishUpdate(plan,api);
 return {duplicate:false,ignored:plan.ignored,stale:plan.stale,responseOmitted:plan.responseQueued===false};
}
