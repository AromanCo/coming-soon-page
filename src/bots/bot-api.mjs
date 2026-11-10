import { URL } from "node:url";
export class BotApiError extends Error {
  constructor(message,{rejected=false,notModified=false,status=0}={}) { super(message); this.name="BotApiError"; this.rejected=rejected; this.notModified=notModified; this.status=status; }
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
    if(!response.ok||data?.ok!==true)throw new BotApiError(this.platform+" "+method+": API failure "+response.status,{rejected:data?.ok===false,notModified:/message is not modified/i.test(String(data?.description||"")),status:response.status});
    return data.result;
  }
  async sendMessage(id,view,origin=""){
    const reply_markup={inline_keyboard:view.rows.map(row=>row.map(b=>b.url?
      {text:b.text,url:b.url}:{text:b.text,callback_data:b.data}))};
    // Images are opt-in. The web host must serve an approved, publicly
    // reachable HTTPS JPEG/PNG to both providers before media is enabled.
    const wantsPhoto=Boolean(origin&&view.photo&&view.text.length<900);
    const target=view.editTarget;
    const editable=Boolean(target&&Number.isSafeInteger(target.messageId)&&
      target.messageId>0&&["photo","text"].includes(target.kind));

    // Question -> question is a text edit. Explicit reusePhoto means the
    // *same* photo is retained while only its caption/buttons change.
    // Welcome photo -> text question, and last text question -> result
    // photo, are deliberate send-first replacement transitions, otherwise
    // a stale image would persist under unrelated copy.
    const mayEditText=editable&&target.kind==="text"&&!wantsPhoto;
    const mayEditCaption=editable&&target.kind==="photo"&&wantsPhoto&&
      view.reusePhoto===true&&view.text.length<=900;
    if(mayEditText||mayEditCaption){
      const payload={chat_id:id,message_id:target.messageId,reply_markup};
      try{
        if(mayEditText)await this.request("editMessageText",{...payload,text:view.text});
        else await this.request("editMessageCaption",{...payload,caption:view.text});
        return;
      }catch(error){
        // An edit retry may be delivered already, before its outbox ack.
        if(error instanceof BotApiError&&error.notModified)return;
        // Never start a second send on ambiguous transport errors, API rate
        // limiting or server errors. Keep retrying the intended edit.
        if(!(error instanceof BotApiError)||!error.rejected||
          error.status===429||error.status>=500)throw error;
      }
    }

    // For all media-mode transitions or definitive edit rejections,
    // deliver the new bubble *before* removing the previous question.
    let delivered=false;
    if(wantsPhoto){
      try{
        await this.request("sendPhoto",{chat_id:id,
          photo:new URL(view.photo,origin).toString(),
          caption:view.text,reply_markup});
        delivered=true;
      }catch(error){
        if(!(error instanceof BotApiError)||!error.rejected||
          error.status===429||error.status>=500)throw error;
      }
    }
    if(!delivered)await this.request("sendMessage",{chat_id:id,
      text:view.text,reply_markup});

    if(editable){
      try{await this.request("deleteMessage",
        {chat_id:id,message_id:target.messageId});}
      catch{try{await this.clearButtons(id,target.messageId);}
        catch{/* Persisted state rejects stale callbacks even if cleanup fails. */}}
    }
  }
  getUpdates(offset){return this.request("getUpdates",{offset,timeout:20,limit:30,allowed_updates:["message","callback_query"]});}
  getWebhookInfo(){return this.request("getWebhookInfo");}
  acknowledge(id,text=""){return this.request("answerCallbackQuery",{callback_query_id:id,text});}
  clearButtons(chatId,messageId){return this.request("editMessageReplyMarkup",{chat_id:chatId,message_id:messageId,reply_markup:{inline_keyboard:[]}});}
}
