const defaults={enabled:true,serverUrl:'https://trace.apps.austinjiang.com',accessToken:''};
const mailHosts=new Set(['mail.google.com','outlook.live.com','outlook.office.com','outlook.office365.com','outlook.cloud.microsoft']);
const ownPrefix=chrome.runtime.getURL('');
const settings=async()=>{const saved=(await chrome.storage.local.get('settings')).settings||{};return {enabled:typeof saved.enabled==='boolean'?saved.enabled:defaults.enabled,serverUrl:saved.serverUrl||defaults.serverUrl,accessToken:saved.accessToken||''};};
async function publicSettings(s){
  const proxyProtection=!!(await chrome.permissions?.contains({origins:['https://*.googleusercontent.com/*']}));let proxyRulesVerified=null;
  if(proxyProtection&&chrome.declarativeNetRequest.testMatchOutcome)try{const result=await chrome.declarativeNetRequest.testMatchOutcome({url:'https://ci3.googleusercontent.com/meips/probe#'+s.serverUrl+'/t/'+'0'.repeat(48)+'.gif',type:'image',initiator:'https://mail.google.com'});proxyRulesVerified=result.matchedRules.some(r=>r.ruleId===2);}catch{}
  return {enabled:s.enabled,serverUrl:s.serverUrl,connected:!!(s.serverUrl&&s.accessToken),proxyProtection,proxyRulesVerified};
}
const validServer=value=>{
  const u=new URL(value);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw new Error('Use an HTTPS server origin, or localhost for testing.');return u.origin;
};
async function api(path,{method='GET',body}={},override){
  const s=override||await settings();if(!s.serverUrl||!s.accessToken)throw new Error('Connect your tracking server in Settings first.');
  const r=await fetch(s.serverUrl+path,{method,headers:{Authorization:`Bearer ${s.accessToken}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(7000),credentials:'include',redirect:'error'});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`Server returned ${r.status}`);return data;
}
async function configure(input){
  const previous=await settings();const serverUrl=validServer(String(input.serverUrl||'').trim());const accessToken=String(input.accessToken||previous.accessToken||'').trim();if(accessToken.length<32)throw new Error('Enter the access token from your server.');
  const next={...previous,serverUrl,accessToken};const remote=await api('/v1/config',{},next);
  if(remote.publicBase && remote.publicBase!==serverUrl)throw new Error('Server URL must match its PUBLIC_BASE_URL setting.');
  await chrome.storage.local.set({settings:next,...(previous.serverUrl!==serverUrl?{pendingCommits:[],nativeBindings:{}}: {})});statusCache=null;await shieldPreview(serverUrl);return {...await publicSettings(next),localOnly:!remote.publicBase};
}
async function shieldPreview(serverUrl){
  const rules=serverUrl?[{id:1,priority:1,action:{type:'block'},condition:{urlFilter:'|'+serverUrl+'/t/',initiatorDomains:[...mailHosts],resourceTypes:['image']}}]:[];
  const proxyAllowed=await chrome.permissions?.contains({origins:['https://*.googleusercontent.com/*']});
  if(serverUrl&&proxyAllowed){
    // Literal URL filters avoid Chrome's small compiled-regex memory budget.
    for(const [offset,pattern] of [serverUrl+'/t/',encodeURIComponent(serverUrl+'/t/')].entries())rules.push({id:2+offset,priority:2,action:{type:'block'},condition:{urlFilter:pattern,initiatorDomains:[...mailHosts],requestDomains:['googleusercontent.com'],resourceTypes:['image']}});
  }
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[1,2,3],addRules:rules});
}
async function notifySettings(){const tabs=await chrome.tabs.query({});for(const tab of tabs){try{if(mailHosts.has(new URL(tab.url).hostname))chrome.tabs.sendMessage(tab.id,{type:'TRACE_SETTINGS_CHANGED'}).catch(()=>{});}catch{}}}
let commitChain=Promise.resolve();
let statusCache=null,statusFlight=null,bindingChain=Promise.resolve();
async function statusRows(){
  const s=await settings();const scope=s.serverUrl+'|'+s.accessToken;
  if(statusCache?.scope===scope&&Date.now()-statusCache.at<10000)return statusCache.rows;
  if(statusFlight)return statusFlight;
  statusFlight=api('/v1/messages').then(data=>{const rows=data.messages||[];statusCache={scope,at:Date.now(),rows};return rows;}).finally(()=>{statusFlight=null;});return statusFlight;
}
function bind(provider,key,ids,metadata){
  const run=bindingChain.then(async()=>{
    const rows=await statusRows();if(ids.some(id=>!rows.some(r=>r.id===id&&r.provider===provider)))throw new Error('Unknown tracked message');
    if(ids.length===1&&metadata&&typeof metadata.subject==='string'&&Array.isArray(metadata.recipients)){
      const record=rows.find(r=>r.id===ids[0]);
      if(record.subject==='(Reply / no subject)'||!record.recipients.length){
        await api(`/v1/messages/${record.id}/metadata`,{method:'POST',body:{provider,subject:metadata.subject.slice(0,500),recipients:metadata.recipients.filter(r=>typeof r==='string'&&r.length<=320).slice(0,200)}});statusCache=null;
      }
    }
    const links=(await chrome.storage.local.get('nativeBindings')).nativeBindings||{};
    const known=new Set(rows.map(r=>r.id));for(const k of Object.keys(links)){links[k]=links[k].filter(id=>known.has(id));if(!links[k].length)delete links[k];}
    links[provider+':'+key]=[...new Set([...(links[provider+':'+key]||[]),...ids])];
    await chrome.storage.local.set({nativeBindings:links});return {ok:true};
  });bindingChain=run.catch(()=>{});return run;
}
function commit(id){const next=commitChain.then(()=>commitOne(id));commitChain=next.catch(()=>{});return next;}
async function commitOne(id){
  const stored=(await chrome.storage.local.get('pendingCommits')).pendingCommits||[];
  if(!stored.includes(id))await chrome.storage.local.set({pendingCommits:[...stored,id]});
  try{await api(`/v1/messages/${id}/commit`,{method:'POST'});statusCache=null;const queue=(await chrome.storage.local.get('pendingCommits')).pendingCommits||[];await chrome.storage.local.set({pendingCommits:queue.filter(x=>x!==id)});}catch{/* Retry on alarm; native sending is already underway. */}
  return {ok:true};
}
chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.alarms.create('trace-retry',{periodInMinutes:1});
  const s=await settings();await chrome.storage.local.set({settings:s});if(s.serverUrl)await shieldPreview(s.serverUrl);
});
chrome.alarms.onAlarm.addListener(async alarm=>{if(alarm.name==='trace-retry'){const ids=(await chrome.storage.local.get('pendingCommits')).pendingCommits||[];for(const id of ids)await commit(id);}});
for(const event of [chrome.permissions?.onAdded,chrome.permissions?.onRemoved])event?.addListener(async()=>{await shieldPreview((await settings()).serverUrl);await notifySettings();});
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  let extension=false,mail=false,provider;try{const u=new URL(sender.url);extension=sender.id===chrome.runtime.id&&sender.url.startsWith(ownPrefix);mail=sender.id===chrome.runtime.id&&mailHosts.has(u.hostname)&&u.protocol==='https:';provider=u.hostname==='mail.google.com'?'gmail':'outlook';}catch{}
  const run=async()=>{
    if(!extension&&!mail)throw new Error('Unsupported origin');
    if(msg.type==='TRACE_SETTINGS')return publicSettings(await settings());
    if(msg.type==='TRACE_OPEN'){await chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')+(/^[a-f0-9]{48}$/.test(msg.id)?'?message='+msg.id:'')});return {ok:true};}
    if(msg.type==='TRACE_STATUS'&&mail){
      const rows=(await statusRows()).filter(r=>r.provider===provider);
      const bindings=(await chrome.storage.local.get('nativeBindings')).nativeBindings||{};
      return {messages:rows.map(({id,subject,recipients,provider,committed,created,signals,excluded,latest})=>({id,subject,recipients,provider,committed,created,signals,excluded,latest})),bindings:Object.fromEntries(Object.entries(bindings).filter(([k])=>k.startsWith(provider+':')))};
    }
    if(msg.type==='TRACE_BIND'&&mail&&typeof msg.key==='string'&&msg.key.length<=1024&&msg.key.length>0&&Array.isArray(msg.ids)&&msg.ids.length>0&&msg.ids.length<=25&&msg.ids.every(id=>/^[a-f0-9]{48}$/.test(id)))return bind(provider,msg.key,msg.ids,msg.metadata);
    if(msg.type==='TRACE_SELF_VIEW'&&mail&&Array.isArray(msg.ids)&&msg.ids.length>0&&msg.ids.length<=25&&msg.ids.every(id=>/^[a-f0-9]{48}$/.test(id))){const result=await api('/v1/self-view',{method:'POST',body:{ids:[...new Set(msg.ids)]}});statusCache=null;return result;}
    if(msg.type==='TRACE_PREPARE'&&mail){
      const s=await settings();if(!s.enabled)throw new Error('Tracking is paused');
      const p=msg.message;if(!/^[a-f0-9]{48}$/.test(p?.id))throw new Error('Invalid tracking ID');
      const data={id:p.id,provider,subject:String(p.subject||'').slice(0,500),recipients:(p.recipients||[]).slice(0,200)};
      const result=await api('/v1/messages',{method:'POST',body:data});
      if(!result.publicBase)throw new Error('Set a public HTTPS origin on your server before tracking real emails.');
      return {id:p.id,pixel:`${result.publicBase}/t/${p.id}.gif`};
    }
    if(msg.type==='TRACE_COMMIT'&&mail&&/^[a-f0-9]{48}$/.test(msg.id))return commit(msg.id);
    if(!extension)throw new Error('Unsupported action');
    if(msg.type==='TRACE_PROXY_STATUS')return {enabled:!!(await chrome.permissions.contains({origins:['https://*.googleusercontent.com/*']}))};
    if(msg.type==='TRACE_PROXY_REFRESH'){
      const s=await settings();await shieldPreview(s.serverUrl);
      const enabled=await chrome.permissions.contains({origins:['https://*.googleusercontent.com/*']});
      const probes=[];
      if(enabled&&chrome.declarativeNetRequest.testMatchOutcome)for(const [name,url] of [['Direct',s.serverUrl+'/t/'+'0'.repeat(48)+'.gif'],['Gmail proxy','https://ci3.googleusercontent.com/meips/probe#'+s.serverUrl+'/t/'+'0'.repeat(48)+'.gif'],['Encoded Gmail proxy','https://ci3.googleusercontent.com/proxy?url='+encodeURIComponent(s.serverUrl+'/t/'+'0'.repeat(48)+'.gif')]]){
        const result=await chrome.declarativeNetRequest.testMatchOutcome({url,type:'image',initiator:'https://mail.google.com'});probes.push({name,matched:result.matchedRules.length>0});
      }
      return {enabled,probes};
    }
    if(msg.type==='TRACE_CONNECT'){const result=await configure(msg.settings);await notifySettings();return result;}
    if(msg.type==='TRACE_PREFERENCES'){const s=await settings();for(const k of ['enabled'])if(typeof msg[k]==='boolean')s[k]=msg[k];await chrome.storage.local.set({settings:s});await notifySettings();return publicSettings(s);}
    if(msg.type==='TRACE_LIST')return api('/v1/messages');
    if(msg.type==='TRACE_DETAIL'&&/^[a-f0-9]{48}$/.test(msg.id))return api(`/v1/messages/${msg.id}`);
    if(msg.type==='TRACE_DELETE'&&/^[a-f0-9]{48}$/.test(msg.id))return api(`/v1/messages/${msg.id}`,{method:'DELETE'});
    throw new Error('Unsupported action');
  };
  run().then(data=>respond({ok:true,data})).catch(error=>respond({ok:false,error:error.message}));return true;
});
