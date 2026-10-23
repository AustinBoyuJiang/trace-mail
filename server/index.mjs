import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const token = () => randomBytes(24).toString('hex');
const safeId = value => /^[a-f0-9]{48}$/.test(value || '');
export function createApp({dbPath = ':memory:', accessToken = token(), publicBase = '', retentionDays = 90, now = Date.now} = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), {recursive:true, mode:0o700});
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, subject TEXT NOT NULL, recipients TEXT NOT NULL, provider TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'prepared', created INTEGER NOT NULL, committed INTEGER, content TEXT);
    CREATE TABLE IF NOT EXISTS events (event_id INTEGER PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, kind TEXT NOT NULL, at INTEGER NOT NULL, source TEXT NOT NULL, seconds REAL NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS events_message_time ON events(message_id,at);
    CREATE TABLE IF NOT EXISTS self_views (message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE, until_at INTEGER NOT NULL);
  `);
  if(!db.prepare('PRAGMA table_info(events)').all().some(c=>c.name==='excluded')) {
    db.exec("ALTER TABLE events ADD COLUMN excluded TEXT; UPDATE events SET excluded='legacy-unverified' WHERE kind='image';");
  }
  const selfCookie=createHmac('sha256',accessToken).update('trace-sender-cookie-v1').digest('hex');
  const insertEvent = db.prepare('INSERT INTO events (message_id,kind,at,source,seconds,excluded) VALUES (?,?,?,?,?,?)');
  const limits = new Map();
  const allow = (key,max,period) => {
    const t = now(); let item = limits.get(key);
    if (!item || t-item.start > period) { item={start:t,count:0}; limits.set(key,item); }
    if (limits.size>10000) for (const [k,v] of limits) if (t-v.start>60000) limits.delete(k);
    return ++item.count<=max;
  };
  function prune() {
    db.prepare('DELETE FROM messages WHERE created < ?').run(now()-retentionDays*86400000);
    db.prepare("DELETE FROM messages WHERE state='prepared' AND created < ? AND id NOT IN (SELECT message_id FROM events)").run(now()-86400000);
  }
  prune();
  const timer = setInterval(prune,3600000); timer.unref();
  const reply = (res,status,data,extra={}) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));};
  async function body(req) {
    let size=0;const chunks=[];
    for await(const chunk of req) {size+=chunk.length;if(size>512000) throw Object.assign(new Error('Request too large'),{status:413});chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString() || '{}');}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}
  }
  function auth(req) {
    const supplied=Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /,''));const expected=Buffer.from(accessToken);
    return supplied.length===expected.length && timingSafeEqual(supplied,expected);
  }
  function message(id) {return db.prepare('SELECT * FROM messages WHERE id=?').get(id);}
  function shape(m,detail=false) {
    const events=db.prepare("SELECT kind,at,source,excluded FROM events WHERE message_id=? AND kind='image' ORDER BY at DESC,event_id DESC").all(m.id);
    const counted=events.filter(e=>!e.excluded);
    return {id:m.id,subject:m.subject,recipients:JSON.parse(m.recipients),provider:m.provider,state:m.state,created:m.created,committed:m.committed,signals:counted.length,excluded:events.length-counted.length,latest:counted[0]?.at||m.committed||m.created,...(detail?{events}:{})};
  }

  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const origin=req.headers.origin || '';
    // Extension fetches only. No arbitrary website CORS.
    if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');}
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const url=new URL(req.url,'http://localhost');const path=url.pathname;
    try {
      if(path==='/health' && req.method==='GET'){reply(res,200,{ok:true,product:'Trace',version:'0.4.0'});return;}
      if(path==='/' && req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Trace</title><style>body{font:16px system-ui;color:#20242d;max-width:600px;margin:12vh auto;padding:32px}h1{font-size:52px;letter-spacing:-3px}p{line-height:1.7;color:#68717e}</style><h1>Trace<span style="color:#6976d9">.</span></h1><p>Your tracking server is online.<br>Open the Trace browser extension to view your private activity.</p><p>Image requests are signals, not proof of reading.<br>Viewing duration is unavailable for ordinary email.</p></html>');return;}
      const image=path.match(/^\/t\/([a-f0-9]{48})\.gif$/);
      if(image && ['GET','HEAD'].includes(req.method)){
        const m=message(image[1]);
        if(m && req.method==='GET' && allow('image:'+m.id,120,3600000)) {
          const ua=String(req.headers['user-agent']||'');
          const source=/bot|crawler|spider|scanner|headless|preview/i.test(ua)?'automated-hint':/GoogleImageProxy|googleusercontent|Outlook-iOS|Microsoft Outlook/i.test(ua)?'proxy-hint':'unverified';
          const ownCookie=String(req.headers.cookie||'').split(';').some(c=>c.trim()==='trace_sender='+selfCookie);
          const selfView=db.prepare('SELECT until_at FROM self_views WHERE message_id=?').get(m.id);
          const excluded=m.state!=='send_requested'?'before-send':ownCookie?'sender-cookie':selfView?.until_at>=now()?'self-view-overlap':source==='automated-hint'?'automated':null;
          const last=db.prepare("SELECT at FROM events WHERE message_id=? AND kind='image' AND source=? ORDER BY at DESC LIMIT 1").get(m.id,source);
          // An ignored preview must not suppress a later, valid signal during deduplication.
          const countedLast=excluded?last:db.prepare("SELECT at FROM events WHERE message_id=? AND kind='image' AND source=? AND excluded IS NULL ORDER BY at DESC LIMIT 1").get(m.id,source);
          if(!countedLast || now()-countedLast.at>=15000)insertEvent.run(m.id,'image',now(),source,0,excluded);
        }
        res.writeHead(200,{'Content-Type':'image/gif','Content-Length':pixel.length,'Cache-Control':'private, no-store, no-cache, max-age=0','Pragma':'no-cache','Expires':'0'});res.end(req.method==='HEAD'?undefined:pixel);return;
      }
      if(path.startsWith('/v1/')){
        if(!auth(req)){reply(res,401,{error:'Invalid access token'});return;}
        res.setHeader('Set-Cookie',`trace_sender=${selfCookie}; Path=/t/; HttpOnly; Secure; SameSite=None; Max-Age=31536000`);
        if(!allow('admin',600,60000)){reply(res,429,{error:'Please try again shortly'});return;}
        if(path==='/v1/self-view' && req.method==='POST'){
          const data=await body(req);
          if(!Array.isArray(data.ids)||data.ids.length>25||!data.ids.length||data.ids.some(id=>!safeId(id))){reply(res,400,{error:'Invalid message IDs'});return;}
          const t=now();
          for(const id of new Set(data.ids))if(message(id)){
            db.prepare('INSERT INTO self_views(message_id,until_at) VALUES (?,?) ON CONFLICT(message_id) DO UPDATE SET until_at=excluded.until_at').run(id,t+8000);
            // Proxy identity is hidden. Preserve overlapping requests as uncertain,
            // rather than claiming the sender's preview proves a recipient opened it.
            db.prepare("UPDATE events SET excluded='self-view-overlap' WHERE message_id=? AND at>=? AND at<=? AND excluded IS NULL").run(id,t-3000,t);
          }
          reply(res,200,{ok:true});return;
        }
        if(path==='/v1/config' && req.method==='GET'){reply(res,200,{ok:true,publicBase,retentionDays});return;}
        if(path==='/v1/messages' && req.method==='GET'){
          const rows=db.prepare("SELECT * FROM messages WHERE state='send_requested' OR id IN (SELECT message_id FROM events) ORDER BY created DESC LIMIT 1000").all();reply(res,200,{messages:rows.map(m=>shape(m))});return;
        }
        if(path==='/v1/messages' && req.method==='POST'){
          const data=await body(req);
          if(!safeId(data.id)||typeof data.subject!=='string'||data.subject.length>500||!Array.isArray(data.recipients)||data.recipients.length>200||data.recipients.some(r=>typeof r!=='string'||r.length>320)||!['gmail','outlook'].includes(data.provider)){reply(res,400,{error:'Invalid message metadata'});return;}
          if(Object.hasOwn(data,'content')){reply(res,400,{error:'Message body uploads are not supported'});return;}
          const old=message(data.id);
          if(old && old.state!=='prepared'){reply(res,409,{error:'This tracking ID was already used'});return;}
          db.prepare(`INSERT INTO messages (id,subject,recipients,provider,created,content) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subject=excluded.subject,recipients=excluded.recipients,content=excluded.content`).run(data.id,data.subject||'(No subject)',JSON.stringify(data.recipients),data.provider,now(),null);
          reply(res,201,{id:data.id,publicBase});return;
        }
        const item=path.match(/^\/v1\/messages\/([a-f0-9]{48})(\/commit|\/metadata)?$/);
        if(item){
          const m=message(item[1]);if(!m){reply(res,404,{error:'Message not found'});return;}
          if(item[2]==='/commit' && req.method==='POST'){db.prepare("UPDATE messages SET state='send_requested',committed=COALESCE(committed,?) WHERE id=?").run(now(),m.id);reply(res,200,{ok:true});return;}
          if(item[2]==='/metadata' && req.method==='POST'){
            const data=await body(req);
            if(data.provider!==m.provider||typeof data.subject!=='string'||data.subject.length>500||!Array.isArray(data.recipients)||data.recipients.length>200||data.recipients.some(r=>typeof r!=='string'||r.length>320)||Object.hasOwn(data,'content')){reply(res,400,{error:'Invalid message metadata'});return;}
            const subject=m.subject==='(Reply / no subject)'&&data.subject.trim()?data.subject:m.subject;
            const recipients=JSON.parse(m.recipients).length?m.recipients:JSON.stringify(data.recipients);
            db.prepare('UPDATE messages SET subject=?,recipients=? WHERE id=?').run(subject,recipients,m.id);reply(res,200,{ok:true});return;
          }
          if(!item[2] && req.method==='GET'){reply(res,200,{message:shape(m,true)});return;}
          if(!item[2] && req.method==='DELETE'){db.prepare('DELETE FROM messages WHERE id=?').run(m.id);reply(res,200,{ok:true});return;}
        }
      }
      reply(res,404,{error:'Not found'});
    }catch(error){if(!res.headersSent)reply(res,error.status||500,{error:error.status?error.message:'Server error'});else res.end();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  const close=()=>{clearInterval(timer);server.close();db.close();};
  return {server,db,close,accessToken};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dataDir=resolve(here,'data');mkdirSync(dataDir,{recursive:true,mode:0o700});
  const keyPath=resolve(dataDir,'access-token');let key=process.env.TRACE_TOKEN;
  if(!key){if(existsSync(keyPath))key=readFileSync(keyPath,'utf8').trim();else{key=token();writeFileSync(keyPath,key+'\n',{mode:0o600,flag:'wx'});}}
  if(key.length<32)throw new Error('TRACE_TOKEN must contain at least 32 characters.');
  const port=Number(process.env.PORT||4318);const host=process.env.HOST||'127.0.0.1';
  const publicBase=(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
  if(publicBase){const u=new URL(publicBase);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('PUBLIC_BASE_URL must be an HTTPS origin.');}
  const days=Number(process.env.RETENTION_DAYS||90);if(!Number.isFinite(days)||days<1||days>3650)throw new Error('Invalid RETENTION_DAYS');
  const app=createApp({dbPath:process.env.DB_PATH||resolve(dataDir,'trace.sqlite'),accessToken:key,publicBase,retentionDays:days});
  app.server.listen(port,host,()=>{console.log(`Trace server ready at http://${host}:${port}`);console.log(process.env.TRACE_TOKEN?'Access token supplied through environment.':`Access token saved in ${keyPath}`);console.log(publicBase?`Public collector: ${publicBase}`:'Local testing only. Set PUBLIC_BASE_URL to a public HTTPS origin for real recipients.');});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.close();process.exit(0);});
}
