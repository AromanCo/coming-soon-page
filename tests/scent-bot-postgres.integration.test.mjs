import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import process from "node:process";
import {setTimeout as sleep} from "node:timers/promises";
import {URL} from "node:url";
import pg from "pg";
import {test} from "node:test";
import {PostgresSessionStore} from "../src/bots/store.mjs";

const connectionString=process.env.BOT_TEST_DATABASE_URL;
const parsedUrl=connectionString?new URL(connectionString):null;
const safeDatabase=parsedUrl&&["127.0.0.1","localhost","::1"].includes(parsedUrl.hostname)&&parsedUrl.pathname==="/bot_test";

test("Scent Companion PostgreSQL reliability integration",{skip:safeDatabase?false:"requires BOT_TEST_DATABASE_URL pointing to loopback database /bot_test"},async t=>{
 const pool=new pg.Pool({connectionString,max:4});
 const store=new PostgresSessionStore(pool);
 const platform="telegram";
 const chatId="synthetic-review-chat";
 const updateId=Date.now();
 let releaseProcessingLock;
 try{
  assert.equal((await pool.query("SELECT current_database() AS name")).rows[0].name,"bot_test");
  for(const migration of ["003_create_scent_bot_sessions.sql","004_add_scent_bot_outbox.sql"]){
   await pool.query(await readFile(`db/migrations/${migration}`,"utf8"));
  }
  await pool.query("DELETE FROM scent_bot_outbox WHERE chat_id=$1",[chatId]);
  await pool.query("DELETE FROM scent_bot_sessions WHERE chat_id=$1",[chatId]);

  await t.test("a provider has one advisory-lock owner, released on shutdown",async()=>{
   const secondStore=new PostgresSessionStore(pool);
   const release=await store.acquireWorkerLock("telegram");
   await assert.rejects(secondStore.acquireWorkerLock("telegram"),/already owns/);
   const releaseBale=await store.acquireWorkerLock("bale");
   await releaseBale();
   await release();
   const releaseAfterRestart=await secondStore.acquireWorkerLock("telegram");
   await releaseAfterRestart();
   const crashedClient=await pool.connect();
   const lock=(await crashedClient.query("SELECT pg_try_advisory_lock(780301) AS acquired")).rows[0].acquired;
   assert.equal(lock,true);
   crashedClient.release(true);
   let releaseAfterCrash;
   for(let attempt=0;attempt<20&&!releaseAfterCrash;attempt++){
    try{releaseAfterCrash=await secondStore.acquireWorkerLock("telegram");}
    catch{await sleep(50);}
   }
   assert.equal(typeof releaseAfterCrash,"function","database connection loss must release the session lock");
   await releaseAfterCrash();
  });
  releaseProcessingLock=await store.acquireWorkerLock(platform);

  await t.test("state, outbox, and offset commit together and duplicate updates are ignored",async()=>{
   const applied=await store.applyUpdate(platform,updateId,async tx=>{
    await tx.put(platform,chatId,{phase:"quick",position:1,answers:{Q09:"الف"}});
    await tx.enqueue(chatId,{text:"next question",rows:[]},"");
    return "committed";
   });
   assert.equal(applied,"committed");
   assert.equal(await store.getOffset(platform),updateId+1);
   assert.deepEqual(await store.get(platform,chatId),{phase:"quick",position:1,answers:{Q09:"الف"}});
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,1);
   const duplicate=await store.applyUpdate(platform,updateId,async()=>{throw Error("duplicate was reprocessed");});
   assert.equal(duplicate.duplicate,true);
   assert.equal(await store.getOffset(platform),updateId+1);
  });

  await t.test("database failure rolls back progress and cursor",async()=>{
   const failedId=updateId+10;
   await assert.rejects(store.applyUpdate(platform,failedId,async tx=>{
    await tx.put(platform,chatId,{phase:"deep",position:4,answers:{Q09:"الف"}});
    await tx.enqueue(chatId,{text:"must roll back",rows:[]},"");
    throw Error("synthetic transaction failure");
   }),/synthetic transaction failure/);
   assert.equal(await store.getOffset(platform),updateId+1);
   assert.deepEqual(await store.get(platform,chatId),{phase:"quick",position:1,answers:{Q09:"الف"}});
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,1);
  });

  await t.test("failed sends remain pending and a lost delete acknowledgement can duplicate delivery",async()=>{
   let attempts=0;
   await assert.rejects(store.deliverPending({sendMessage:async()=>{attempts++;throw Error("synthetic provider failure");}},platform),/synthetic provider failure/);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,1);
   await pool.query(`CREATE OR REPLACE FUNCTION test_fail_scent_outbox_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic delete failure'; END $$`);
   await pool.query("CREATE TRIGGER test_fail_scent_outbox_delete BEFORE DELETE ON scent_bot_outbox FOR EACH ROW EXECUTE FUNCTION test_fail_scent_outbox_delete()");
   await assert.rejects(store.deliverPending({sendMessage:async()=>{attempts++;}},platform),/synthetic delete failure/);
   await pool.query("DROP TRIGGER test_fail_scent_outbox_delete ON scent_bot_outbox");
   await pool.query("DROP FUNCTION test_fail_scent_outbox_delete()");
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,1);
   await store.deliverPending({sendMessage:async()=>{attempts++;}},platform);
   assert.equal(attempts,3);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,0);
  });

  await t.test("/forget transaction clears session and any pending answer delivery",async()=>{
   const forgetId=updateId+20;
   await store.applyUpdate(platform,forgetId,async tx=>{
    await tx.forget(platform,chatId);
    await tx.enqueue(chatId,{text:"deleted",rows:[]},"");
   });
   assert.equal(await store.get(platform,chatId),null);
   const queued=(await pool.query("SELECT view->>'text' AS text FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows;
   assert.deepEqual(queued.map(row=>row.text),["deleted"]);
  });

  await t.test("expired sessions are unreadable and pruned",async()=>{
   await store.put(platform,chatId,{phase:"quick",position:2,answers:{Q09:"الف"}});
   await pool.query("UPDATE scent_bot_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE platform=$1 AND chat_id=$2",[platform,chatId]);
   assert.equal(await store.get(platform,chatId),null);
   await store.prune();
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_sessions WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,0);
   await pool.query("UPDATE scent_bot_outbox SET expires_at=NOW()-INTERVAL '1 second' WHERE platform=$1 AND chat_id=$2",[platform,chatId]);
   let delivered=false;
   await store.deliverPending({sendMessage:async()=>{delivered=true;}},platform);
   assert.equal(delivered,false);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,0);
  });
 }finally{
  await releaseProcessingLock?.();
  await pool.query("DROP TRIGGER IF EXISTS test_fail_scent_outbox_delete ON scent_bot_outbox").catch(()=>{});
  await pool.query("DROP FUNCTION IF EXISTS test_fail_scent_outbox_delete()").catch(()=>{});
  await pool.query("DELETE FROM scent_bot_outbox WHERE chat_id=$1",[chatId]).catch(()=>{});
  await pool.query("DELETE FROM scent_bot_sessions WHERE chat_id=$1",[chatId]).catch(()=>{});
  await pool.query("DELETE FROM scent_bot_poll_offsets WHERE platform=$1",[platform]).catch(()=>{});
  await pool.end();
 }
});
