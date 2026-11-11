#!/usr/bin/env node
/**
 * Owner-controlled, non-polling provider smoke test for Telegram or Bale.
 * No database, webhook mutation, getUpdates or production credentials.
 * Explicit --send-test-messages is required.
 * Does not replace full real test-bot Scent Quest acceptance.
 */
import {readFileSync, lstatSync} from "node:fs";
import console from "node:console";
import process from "node:process";
import {URL} from "node:url";
import {BotApi} from "../src/bots/bot-api.mjs";

const required=["AROMAN_QA_PLATFORM","AROMAN_QA_TOKEN_FILE",
  "AROMAN_QA_CHAT_ID","AROMAN_QA_EXPECTED_USERNAME"];
function fail(message){console.error("QA STOP: "+message);process.exit(2);}
if(process.argv.length!==3||process.argv[2]!=="--send-test-messages")
  fail("Use --send-test-messages with isolated QA environment variables.");
for(const name of required)
  if(!process.env[name])fail("Missing "+name);

const platform=process.env.AROMAN_QA_PLATFORM;
if(!["telegram","bale"].includes(platform))fail("Invalid QA platform");
const chatId=process.env.AROMAN_QA_CHAT_ID;
if(!/^[1-9]\d{0,17}$/.test(chatId))fail("Use a positive private test chat ID");
const expected=process.env.AROMAN_QA_EXPECTED_USERNAME.replace(/^@/,"").toLowerCase();
if(!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/i.test(expected))
  fail("Expected username must be explicitly provided");
if(expected==="aroman_bot")fail("Production Bale identity is prohibited");
if(!/(?:test|sandbox|qa)/i.test(expected))
  fail("The expected bot username must clearly identify a QA/test bot");

const file=process.env.AROMAN_QA_TOKEN_FILE;
let stat;
try{stat=lstatSync(file);}catch{fail("Token file is not accessible");}
if(!stat.isFile()||(stat.mode&0o077)!==0)
  fail("Token must be a regular file accessible only to owner");
if(typeof process.getuid==="function"&&stat.uid!==process.getuid())
  fail("Token file must belong to current user");
const token=readFileSync(file,"utf8").trim();
if(!token||/\s/.test(token))fail("Invalid token file");
const api=new BotApi({platform,token});
let textId=null,photoId=null;
let passed=false;
const req=(method,payload)=>api.request(method,payload,12000);
const cleanup=async(id)=>{
  if(id===null)return;
  try{await req("deleteMessage",{chat_id:chatId,message_id:id});}
  catch{console.log("CHECK: A test message could not be removed; clear it in the test chat.");}
};
try{
  const me=await req("getMe",{});
  const actual=String(me?.username||"").replace(/^@/,"").toLowerCase();
  if(!actual||actual!==expected)
    fail("getMe identity did not match the explicitly expected test bot username");
  await req("getWebhookInfo",{});
  console.log("PASS: "+platform+" QA bot identity and API; no webhook changed");
  const sent=await req("sendMessage",{
    chat_id:chatId,text:"AROMAN UX QA · پرسش اول",
    reply_markup:{inline_keyboard:[[{text:"انتخاب آزمایشی",callback_data:"qa:local"}]]}
  });
  textId=sent?.message_id;
  if(!Number.isSafeInteger(textId))throw Error("Provider did not return a numeric message ID");
  await req("editMessageText",{
    chat_id:chatId,message_id:textId,text:"AROMAN UX QA · پرسش دوم",
    reply_markup:{inline_keyboard:[]}
  });
  console.log("PASS: Text question edited in place");
  const photoUrl=process.env.AROMAN_QA_PHOTO_URL;
  if(photoUrl){
    let url;
    try{url=new URL(photoUrl);}catch{throw Error("Invalid QA image URL");}
    if(url.protocol!=="https:"||url.username||url.password)
      throw Error("QA image URL must be public HTTPS");
    const sentPhoto=await req("sendPhoto",{
      chat_id:chatId,photo:url.toString(),caption:"AROMAN UX QA · تصویر آزمایشی"
    });
    photoId=sentPhoto?.message_id;
    if(!Number.isSafeInteger(photoId))throw Error("Provider did not return a photo message ID");
    await req("editMessageCaption",{
      chat_id:chatId,message_id:photoId,caption:"AROMAN UX QA · شرح تصویر ویرایش شد"
    });
    console.log("PASS: Photo caption edited in place");
  }else console.log("NOT RUN: Photo test (no approved AROMAN_QA_PHOTO_URL)");
  passed=true;
}catch{
  console.error("FAIL: Provider QA edit test; inspect the test chat. Details suppressed.");
  process.exitCode=1;
}finally{
  await cleanup(photoId);
  await cleanup(textId);
  if(passed)console.log("AROMAN "+platform+" PROVIDER EDIT SMOKE PASSED");
}
