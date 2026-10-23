const provider=new URLSearchParams(location.search).get('provider')||'gmail';
document.documentElement.dataset.traceFixture=provider;
document.querySelector('#provider').textContent=(provider==='gmail'?'Gmail':'Outlook')+' adapter · local fixture · no mail sent';
if(provider==='gmail')location.hash='sent';else history.replaceState(null,'','/mail/sentitems/?provider=outlook');
const now=Date.now(),a='a'.repeat(48),b='b'.repeat(48),c='c'.repeat(48),d='d'.repeat(48),legacy='e'.repeat(48);
const messages=[
 {id:a,subject:'A little clarity',provider,recipients:['alex@example.test'],committed:now,signals:0,excluded:1,latest:now},
 {id:b,subject:'Project notes',provider,recipients:['sam@example.test'],committed:now-3600000,signals:2,latest:now},
 {id:c,subject:'Ambiguous',provider,recipients:['sam@example.test'],committed:now-7200000,signals:1,latest:now},
 {id:d,subject:'Ambiguous',provider,recipients:['sam@example.test'],committed:now-7200000,signals:1,latest:now},
 {id:legacy,subject:'(Reply / no subject)',provider,recipients:[],committed:now-10800000,signals:0,latest:now}
];
const bindings={},calls=[],listeners=[];
globalThis.chrome={runtime:{lastError:null,onMessage:{addListener(fn){listeners.push(fn);}},sendMessage(msg,cb){
 calls.push(msg);setTimeout(()=>{let data={ok:true};
  if(msg.type==='TRACE_SETTINGS')data={enabled:true,connected:true,serverUrl:location.origin};
  if(msg.type==='TRACE_STATUS')data={messages,bindings};
  if(msg.type==='TRACE_BIND'){bindings[provider+':'+msg.key]=msg.ids;if(msg.metadata&&msg.ids.length===1){const record=messages.find(m=>m.id===msg.ids[0]);if(record.subject==='(Reply / no subject)'){record.subject=msg.metadata.subject;record.recipients=msg.metadata.recipients;}}}
  cb({ok:true,data});
 },10);
}}};
const date=t=>new Date(t).toLocaleString('en-US',{weekday:'short',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
function row(key,subject,email,at){return provider==='gmail'
 ?`<tr class="zA" data-test-key="${key}"><td class="a4W"><div class="y6"><span data-legacy-thread-id="${key}">${subject}</span></div></td><td><span email="${email}">${email}</span></td><td class="xW"><span title="${date(at)}">${date(at)}</span></td></tr>`
 :`<div role="option" class="outlook-row" data-convid="${key}" data-test-key="${key}"><div class="nf3X_"><span class="TtcXM">${subject}</span><span email="${email}">${email}</span><span title="${date(at)}">${date(at)}</span></div></div>`;
}
const list=document.querySelector('#list');
const items=row('native-alpha','A little clarity','alex@example.test',now)+row('native-beta','Project notes','sam@example.test',now-3600000)+row('native-ambiguous','Ambiguous','sam@example.test',now-7200000)+row('native-old','A little clarity','alex@example.test',now-86400000)+row('native-legacy','Recovered legacy message','alex@example.test',now-10800000);
list.innerHTML=provider==='gmail'?`<table><tbody>${items}</tbody></table>`:items;
const cached=document.createElement('div');cached.style.display='none';cached.innerHTML=provider==='gmail'?`<table>${row('native-alpha','A little clarity','alex@example.test',now)}</table>`:row('native-alpha','A little clarity','alex@example.test',now);document.body.append(cached);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
window.addEventListener('load',async()=>{
 const results=document.querySelector('#results'),lines=[];
 const check=(text,pass)=>{lines.push((pass?'PASS':'FAIL')+'  '+text);results.textContent=lines.join('\n');if(!pass)throw Error(text);};
 const badge=key=>list.querySelector(`[data-test-key="${key}"] .trace-list-status`);
 try{
  await pause(450);
  check('Every visible Sent row has a status, including No data',list.querySelectorAll('.trace-list-status').length===5);
  check('No-signal and open-signal states are distinct',badge('native-alpha').textContent==='No signal yet'&&badge('native-beta').textContent==='Open signal');
  check('Ambiguous, old and unlinked messages show No data',badge('native-ambiguous').textContent==='No data'&&badge('native-old').textContent==='No data'&&badge('native-legacy').textContent==='No data');
  check('Only unique native identifiers are persisted',calls.filter(m=>m.type==='TRACE_BIND').length===2);
  badge('native-alpha').click();await pause(50);
  check('Badge opens the exact tracking record',calls.some(m=>m.type==='TRACE_OPEN'&&m.id===a));
  const target=list.querySelector('[data-test-key="native-legacy"]');
  target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));target.setAttribute('aria-selected','true');list.style.display='none';
  const img=document.createElement('img');img.src='https://ci3.googleusercontent.com/proxy#'+location.origin+'/t/'+legacy+'.gif';document.querySelector('#preview').append(img);
  await pause(250);
  check('Own proxy preview is removed and reported for exclusion',!img.hasAttribute('src')&&img.dataset.traceOwnId===legacy&&calls.some(m=>m.type==='TRACE_SELF_VIEW'&&m.ids.includes(legacy)));
  check('An opened pixel links the native row despite hidden cached lists',bindings[provider+':native-legacy']?.[0]===legacy&&messages.find(m=>m.id===legacy).subject==='Recovered legacy message');
  list.style.display='';await pause(300);
  check('Returning to Sent displays the recovered status',badge('native-legacy').textContent==='No signal yet'&&cached.querySelector('.trace-list-status')===null);
  results.className='pass';results.textContent+='\n\nAll '+lines.length+' checks passed. No mail was sent.';
 }catch(e){results.className='fail';results.textContent+='\nStopped: '+e.message;}
});
