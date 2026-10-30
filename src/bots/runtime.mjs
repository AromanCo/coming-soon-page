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
export async function processUpdate({platform,update,api,store,engineConfig,mediaOrigin=""}){
 const event=parseUpdate(update);if(!event)return {ignored:true};
 const state=await store.get(platform,event.chatId);
 const outcome=transitionSession(state,event.action,engineConfig);
 if(event.callbackId)try{await api.acknowledge(event.callbackId,outcome.stale?"این دکمه قدیمی شده 🌿":"");}catch{/* Callback acknowledgements must not block state processing. */}
 if(outcome.stale)return {ignored:true,stale:true};
 if(outcome.erase)await store.forget(platform,event.chatId);
 else if(outcome.changed)await store.put(platform,event.chatId,outcome.session);
 if(outcome.view)await api.sendMessage(event.chatId,outcome.view,mediaOrigin);
 if(event.callbackId&&outcome.changed&&event.messageId)try{await api.clearButtons(event.chatId,event.messageId);}catch{/* Old buttons remain harmless because state validation rejects them. */}
 return {ignored:false};
}
