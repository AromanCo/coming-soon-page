import { URL } from "node:url";
export class BotApiError extends Error {
  constructor(message,{rejected=false}={}) { super(message); this.name="BotApiError"; this.rejected=rejected; }
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
    if(!response.ok||data?.ok!==true)throw new BotApiError(this.platform+" "+method+": API failure "+response.status,{rejected:data?.ok===false});
    return data.result;
  }
  async sendMessage(id,view,origin=""){
    const reply_markup={inline_keyboard:view.rows.map(row=>row.map(b=>b.url?{text:b.text,url:b.url}:{text:b.text,callback_data:b.data}))};
    if(origin&&view.photo&&view.text.length<900){
      try{await this.request("sendPhoto",{chat_id:id,photo:new URL(view.photo,origin).toString(),caption:view.text,reply_markup});return;}catch(error){if(!(error instanceof BotApiError)||!error.rejected)throw error;}
    }
    await this.request("sendMessage",{chat_id:id,text:view.text,reply_markup});
  }
  getUpdates(offset){return this.request("getUpdates",{offset,timeout:20,limit:30,allowed_updates:["message","callback_query"]});}
  getWebhookInfo(){return this.request("getWebhookInfo");}
  acknowledge(id,text=""){return this.request("answerCallbackQuery",{callback_query_id:id,text});}
  clearButtons(chatId,messageId){return this.request("editMessageReplyMarkup",{chat_id:chatId,message_id:messageId,reply_markup:{inline_keyboard:[]}});}
}
