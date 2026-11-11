import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {URL} from "node:url";
import {BotApi} from "../src/bots/bot-api.mjs";
import {newSession,transitionSession} from "../src/bots/engine.mjs";
import {readMiniAppUrl} from "../src/bots/miniapp-url.mjs";

const quiz=JSON.parse(readFileSync(new URL("../src/lib/scent-quest/quiz-data.json",import.meta.url),"utf8"));
const catalog=JSON.parse(readFileSync(new URL("../public/data/scent-quest-perfumes.json",import.meta.url),"utf8"));
const deps={quiz,catalog,siteUrl:"https://aroman.ir"};

test("Mini App is disabled by default with the original native chat CTA unchanged",()=>{
  const view=transitionSession(newSession(),"/start",deps).view;
  assert.equal(view.rows.some(row=>row.some(b=>b.webApp)),false);
  assert.equal(view.rows[0][0].data,"n:quick");
  assert.equal(readMiniAppUrl("","bale"),"");
  assert.equal(readMiniAppUrl("","telegram"),"");
});

for(const platform of ["bale","telegram"]){
  test(platform+": validates only its exact AROMAN-owned HTTPS URL",()=>{
    const url="https://aroman.ir/scent-quest/mini?provider="+platform;
    assert.equal(readMiniAppUrl(url,platform),url);
    assert.equal(readMiniAppUrl("https://preview.aroman.ir/scent-quest/mini?provider="+platform,platform),
      "https://preview.aroman.ir/scent-quest/mini?provider="+platform);
    const view=transitionSession(newSession(),"/start",{...deps,miniAppUrl:url}).view;
    assert.equal(view.rows[0][0].webApp,url);
    assert.equal(view.rows[1][0].data,"n:quick");
    assert.equal(view.rows[2][0].url,"https://aroman.ir");
  });

  test(platform+": serializes native web_app button without displacing fallback chat button",async()=>{
    const calls=[];
    const fetchImpl=async(url,options)=>{
      calls.push({method:new URL(url).pathname.split("/").pop(),body:JSON.parse(options.body)});
      return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:1}})};
    };
    const api=new BotApi({platform,token:"test-only-synthetic",fetchImpl});
    const link=readMiniAppUrl("https://aroman.ir/scent-quest/mini?provider="+platform,platform);
    const view=transitionSession(newSession(),"/start",{...deps,miniAppUrl:link}).view;
    await api.sendMessage("42",view);
    assert.equal(calls[0].method,"sendMessage");
    const buttons=calls[0].body.reply_markup.inline_keyboard;
    assert.deepEqual(buttons[0][0],{text:"✨ تجربه تصویری کشف رایحه",web_app:{url:link}});
    assert.equal(buttons[1][0].callback_data,"n:quick");
    assert.equal(buttons[2][0].url,"https://aroman.ir");
  });
}

test("Mini App URL guard fails closed on cross-provider links and unapproved destinations",()=>{
  const rejected=[
    "http://aroman.ir/scent-quest/mini?provider=bale",
    "https://aroman.ir.evil.example/scent-quest/mini?provider=bale",
    "https://evil.example/scent-quest/mini?provider=bale",
    "https://aroman.ir:8443/scent-quest/mini?provider=bale",
    "https://user:pass@aroman.ir/scent-quest/mini?provider=bale",
    "https://aroman.ir/scent-quest/mini?provider=telegram",
    "https://aroman.ir/scent-quest/mini?provider=bale&token=foo",
    "https://aroman.ir/scent-quest/mini?provider=bale&provider=bale",
    "https://aroman.ir/scent-quest/mini?provider=bale#secret",
    "https://aroman.ir/other?provider=bale",
    " https://aroman.ir/scent-quest/mini?provider=bale "
  ];
  for(const url of rejected)assert.throws(()=>readMiniAppUrl(url,"bale"));
  assert.throws(()=>readMiniAppUrl("https://aroman.ir/scent-quest/mini?provider=other","other"));
});

test("Both production Compose overlays keep Mini App disabled unless operator enables it",()=>{
  for(const path of ["compose.afra.bale.yaml","compose.sweden.telegram.yaml"]){
    const file=readFileSync(new URL("../"+path,import.meta.url),"utf8");
    assert.match(file,/BOT_MINIAPP_URL: \$\{BOT_MINIAPP_URL:-\}/);
    assert.doesNotMatch(file,/BOT_MINIAPP_URL: https:/);
  }
});
