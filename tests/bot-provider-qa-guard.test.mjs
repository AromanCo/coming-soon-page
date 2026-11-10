import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import process from "node:process";
import {fileURLToPath,URL} from "node:url";

const script=fileURLToPath(new URL("../scripts/qa-bot-provider-edit.mjs",import.meta.url));
const qaEnv={
  ...process.env,
  AROMAN_QA_PLATFORM:"bale",
  AROMAN_QA_TOKEN_FILE:"/never-present-qa-token",
  AROMAN_QA_CHAT_ID:"123456789",
  AROMAN_QA_EXPECTED_USERNAME:"aroman_bot"
};
test("provider QA harness refuses implicit message-sending",()=>{
  const r=spawnSync(process.execPath,[script],{env:qaEnv,encoding:"utf8",timeout:5000});
  assert.equal(r.status,2);
  assert.match(r.stderr,/--send-test-messages/);
  assert.equal(r.stdout,"");
});
test("provider QA harness refuses known production Bale identity without network access",()=>{
  const r=spawnSync(process.execPath,[script,"--send-test-messages"],{
    env:qaEnv,encoding:"utf8",timeout:5000
  });
  assert.equal(r.status,2);
  assert.match(r.stderr,/Production Bale identity is prohibited/);
  assert.equal(r.stdout,"");
});
test("provider QA harness requires test-named identity before trying token file",()=>{
  const r=spawnSync(process.execPath,[script,"--send-test-messages"],{
    env:{...qaEnv,AROMAN_QA_EXPECTED_USERNAME:"aroman_normal"},
    encoding:"utf8",timeout:5000
  });
  assert.equal(r.status,2);
  assert.match(r.stderr,/clearly identify a QA\/test bot/);
  assert.equal(r.stdout,"");
});
