import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,pixel} from '../server/index.mjs';
const key='test-only-'.repeat(8),id='a'.repeat(48);
async function fixture(options={}){const app=createApp({accessToken:key,publicBase:'https://trace.example.test',...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const url=`http://127.0.0.1:${app.server.address().port}`;const call=(path,method='GET',data,headers={})=>fetch(url+path,{method,headers:{Authorization:`Bearer ${key}`,...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});return {...app,url,call};}
const meta={id,subject:'A proposal',recipients:['person@example.test'],provider:'gmail'};
test('authentication protects metadata, writes and deletion',async()=>{const f=await fixture();try{for(const [path,method] of [['/v1/messages','GET'],['/v1/messages','POST'],[`/v1/messages/${id}`,'DELETE']])assert.equal((await fetch(f.url+path,{method})).status,401);assert.equal((await fetch(f.url+'/health')).status,200);const r=await f.call('/v1/messages','OPTIONS');assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),null);}finally{f.close();}});
test('message lifecycle, signal deduplication, HEAD suppression and deletion',async()=>{let time=1700000000000;const f=await fixture({now:()=>time});try{
 assert.equal((await f.call('/v1/messages','POST',meta)).status,201);assert.deepEqual((await(await f.call('/v1/messages')).json()).messages,[]);await f.call(`/v1/messages/${id}/commit`,'POST');await fetch(`${f.url}/t/${id}.gif`,{method:'HEAD'});
 let detail=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(detail.signals,0);
 const r=await fetch(`${f.url}/t/${id}.gif`);assert.equal(r.headers.get('content-type'),'image/gif');assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),pixel);
 await fetch(`${f.url}/t/${id}.gif`);detail=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(detail.signals,1);
 time+=16000;await fetch(`${f.url}/t/${id}.gif`,{headers:{'User-Agent':'GoogleImageProxy'}});detail=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(detail.signals,2);assert.equal(detail.events[0].source,'proxy-hint');assert.equal(detail.state,'send_requested');assert.equal((await f.call('/v1/messages','POST',meta)).status,409);
 await f.call(`/v1/messages/${id}`,'DELETE');assert.equal((await f.call(`/v1/messages/${id}`)).status,404);assert.equal((await fetch(`${f.url}/t/${id}.gif`)).status,200);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,0);
 }finally{f.close();}});
test('body uploads are rejected and no reading page or timing API is exposed',async()=>{const f=await fixture();try{
 assert.equal((await f.call('/v1/messages','POST',{...meta,content:'Private message body'})).status,400);
 assert.equal((await f.call('/v1/messages','POST',meta)).status,201);
 assert.equal(f.db.prepare('SELECT content FROM messages WHERE id=?').get(id).content,null);
 for(const path of [`/r/${id}`,'/reader.js',`/v1/reader/${id}/session`])assert.equal((await f.call(path)).status,404);
 const detail=(await(await f.call(`/v1/messages/${id}`)).json()).message;
 assert.ok(!('seconds' in detail));assert.ok(!('readers' in detail));assert.ok(!('content' in detail));
 }finally{f.close();}});
test('validation rejects invalid metadata and public routes reveal no metadata',async()=>{const f=await fixture();try{
 for(const bad of [{...meta,id:'123'},{...meta,content:'x'.repeat(100001)},{...meta,provider:'other'}])assert.equal((await f.call('/v1/messages','POST',bad)).status,400);
 await f.call('/v1/messages','POST',meta);assert.equal((await fetch(`${f.url}/r/${id}`)).status,404);assert.ok(!(await(await fetch(`${f.url}/t/${id}.gif`)).text()).includes('person@example.test'));assert.equal((await f.call('/v1/messages','GET',undefined,{Origin:'https://evil.example'})).headers.get('access-control-allow-origin'),null);
 }finally{f.close();}});
test('SQLite persists records across restarts and prunes expired data',async()=>{const dir=mkdtempSync(join(tmpdir(),'trace-test-'));let time=1700000000000;try{const options={dbPath:join(dir,'test.sqlite'),now:()=>time};const first=await fixture(options);await first.call('/v1/messages','POST',meta);await first.call(`/v1/messages/${id}/commit`,'POST');first.close();const second=await fixture(options);assert.equal((await(await second.call('/v1/messages')).json()).messages.length,1);second.close();time+=91*86400000;const third=await fixture(options);assert.equal((await(await third.call('/v1/messages')).json()).messages.length,0);third.close();}finally{rmSync(dir,{recursive:true,force:true});}});

test('sender protection excludes draft loads, cookies, bots and self-view overlaps while retaining the audit events',async()=>{
 let time=1700000000000;const f=await fixture({now:()=>time});try{
 const created=await f.call('/v1/messages','POST',meta);const cookie=created.headers.get('set-cookie').split(';')[0];assert.match(cookie,/^trace_sender=/);
 await fetch(`${f.url}/t/${id}.gif`);await f.call(`/v1/messages/${id}/commit`,'POST');
 await fetch(`${f.url}/t/${id}.gif`);let m=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.signals,1);assert.equal(m.excluded,1);assert.equal(m.events[1].excluded,'before-send');
 time+=16000;await fetch(`${f.url}/t/${id}.gif`,{headers:{Cookie:cookie}});m=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.signals,1);assert.equal(m.events[0].excluded,'sender-cookie');
 time+=16000;await fetch(`${f.url}/t/${id}.gif`,{headers:{'User-Agent':'SecurityScannerBot'}});m=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.signals,1);assert.equal(m.events[0].excluded,'automated');
 time+=16000;await fetch(`${f.url}/t/${id}.gif`,{headers:{'User-Agent':'GoogleImageProxy'}});time+=1000;await f.call('/v1/self-view','POST',{ids:[id]});m=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.signals,1);assert.equal(m.events[0].excluded,'self-view-overlap');
 time+=1000;await fetch(`${f.url}/t/${id}.gif`);m=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.signals,1);assert.equal(m.events[0].excluded,'self-view-overlap');
 time+=9000;await fetch(`${f.url}/t/${id}.gif`);m=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.signals,2);assert.equal(m.events[0].excluded,null);assert.ok(m.excluded>=4);
 }finally{f.close();}
});
test('self-view corrections require authentication and validated bounded IDs',async()=>{const f=await fixture();try{assert.equal((await fetch(f.url+'/v1/self-view',{method:'POST',body:JSON.stringify({ids:[id]})})).status,401);for(const ids of [[],['bad'],Array(26).fill(id)])assert.equal((await f.call('/v1/self-view','POST',{ids})).status,400);}finally{f.close();}});

test('legacy image events are preserved as unverified during the sender-filter migration',async()=>{const dir=mkdtempSync(join(tmpdir(),'trace-migrate-'));try{const options={dbPath:join(dir,'test.sqlite')};const old=await fixture(options);await old.call('/v1/messages','POST',meta);await old.call(`/v1/messages/${id}/commit`,'POST');await fetch(`${old.url}/t/${id}.gif`);old.db.exec('ALTER TABLE events DROP COLUMN excluded');old.close();const next=await fixture(options);try{const m=(await(await next.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.signals,0);assert.equal(m.excluded,1);assert.equal(m.events[0].excluded,'legacy-unverified');assert.equal(next.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);}finally{next.close();}}finally{rmSync(dir,{recursive:true,force:true});}});

test('verified native bindings may fill missing legacy metadata without overwriting known values',async()=>{const f=await fixture();try{await f.call('/v1/messages','POST',{...meta,subject:'(Reply / no subject)',recipients:[]});await f.call(`/v1/messages/${id}/commit`,'POST');const recovered={subject:'Recovered from Sent',provider:'gmail',recipients:['alex@example.test']};assert.equal((await f.call(`/v1/messages/${id}/metadata`,'POST',recovered)).status,200);let m=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.subject,recovered.subject);assert.deepEqual(m.recipients,recovered.recipients);await f.call(`/v1/messages/${id}/metadata`,'POST',{...recovered,subject:'Wrong overwrite',recipients:['other@example.test']});m=(await(await f.call(`/v1/messages/${id}`)).json()).message;assert.equal(m.subject,recovered.subject);assert.deepEqual(m.recipients,recovered.recipients);assert.equal((await f.call(`/v1/messages/${id}/metadata`,'POST',{...recovered,provider:'outlook'})).status,400);assert.equal((await f.call(`/v1/messages/${id}/metadata`,'POST',{...recovered,content:'Never upload body'})).status,400);assert.equal((await fetch(f.url+`/v1/messages/${id}/metadata`,{method:'POST',body:JSON.stringify(recovered)})).status,401);}finally{f.close();}});
