import { URL } from "node:url";
export class BotApiError extends Error {
  constructor(message,{rejected=false,status=0}={}) { super(message); this.name="BotApiError"; this.rejected=rejected; this.status=status; }
}
export class BotApi {
  constructor({platform,token,fetchImpl=globalThis.fetch}) {
    if(!["telegram","bale"].includes(platform)||!token)throw Error("Invalid platform or missing token");
    this.platform=platform;this.token=token;this.fetchImpl=fetchImpl;
    this.origin=platform==="telegram"?"https://api.telegram.org":"https://tapi.bale.ai";
  }
  async request(method,payload={},timeout=40000){
    let response;
    try {response=await this.fetchImpl(this.origin+"/bot"+this.token+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),signal:globalThis.AbortSignal.timeout(timeout)});}
    catch{throw new BotApiError(this.platform+" "+method+": connection failure; delivery may be unknown");}
    const data=await response.json().catch(()=>null);
    if(!response.ok||data?.ok!==true){
      // Replaying an already-applied edit after a delivery acknowledgement loss
      // is idempotent, not a reason to send a second chat message.
      if(method.startsWith("editMessage")&&typeof data?.description==="string"&&
        /message is not modified/i.test(data.description))return true;
      throw new BotApiError(this.platform+" "+method+": API failure "+response.status,
        {rejected:data?.ok===false,status:response.status});
    }
    return data.result;
  }
  async sendMessage(id,view,origin=""){
    const reply_markup={inline_keyboard:view.rows.map(row=>row.map(b=>b.url?{text:b.text,url:b.url}:{text:b.text,callback_data:b.data}))};
    if(origin&&view.photo&&view.text.length<900){
      try{await this.request("sendPhoto",{chat_id:id,photo:new URL(view.photo,origin).toString(),caption:view.text,reply_markup});return;}catch(error){if(!(error instanceof BotApiError)||!error.rejected)throw error;}
    }
    await this.request("sendMessage",{chat_id:id,text:view.text,reply_markup});
  }
  async deliverView(id,view,origin=""){
    const target=view?.editTarget;
    if(!target)return this.sendMessage(id,view,origin);
    if(!Number.isSafeInteger(target.messageId)||target.messageId<=0||
      !["text","photo"].includes(target.kind))throw new Error("Invalid editable message target");
    const markup={inline_keyboard:view.rows.map(row=>row.map(b=>b.url?
      {text:b.text,url:b.url}:{text:b.text,callback_data:b.data}))};
    const payload={chat_id:id,message_id:target.messageId,reply_markup:markup};
    const canEditCaption=target.kind==="photo"&&view.text.length<=1024;
    const canEditText=target.kind==="text"&&view.text.length<=4096;
    if(canEditCaption)payload.caption=view.text;
    if(canEditText)payload.text=view.text;
    if(canEditCaption||canEditText){
      try{
        await this.request(canEditCaption?"editMessageCaption":"editMessageText",payload);
        return;
      }catch(error){
        // Only definitive client-side provider rejections permit a send fallback.
        // Network ambiguity and server errors retain the outbox retry contract.
        if(!(error instanceof BotApiError)||!error.rejected||
          error.status===429||error.status>=500)throw error;
      }
    }
    await this.sendMessage(id,view,origin);
    // Best-effort cleanup after a confirmed replacement was sent. If deletion
    // is not supported or permitted, remove the original buttons instead.
    try{await this.request("deleteMessage",{chat_id:id,message_id:target.messageId});}
    catch{try{await this.clearButtons(id,target.messageId);}catch{/* Stale callbacks remain default-deny. */}}
  }
  getUpdates(offset){return this.request("getUpdates",{offset,timeout:20,limit:30,allowed_updates:["message","callback_query"]});}
  getWebhookInfo(){return this.request("getWebhookInfo");}
  acknowledge(id,text=""){return this.request("answerCallbackQuery",{callback_query_id:id,text});}
  clearButtons(chatId,messageId){return this.request("editMessageReplyMarkup",{chat_id:chatId,message_id:messageId,reply_markup:{inline_keyboard:[]}});}
}
