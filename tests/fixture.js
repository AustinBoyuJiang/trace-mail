const variant=new URLSearchParams(location.search).get('provider')||'gmail';document.documentElement.dataset.traceFixture=variant;
if(variant==='outlook'){const editor=document.querySelector('[contenteditable]');editor.setAttribute('aria-label','Message body');editor.removeAttribute('g_editable');}
document.getElementById('provider').textContent='Adapter: '+variant;
let settings={enabled:true,connected:true,serverUrl:location.origin};let fail=false,prepareCount=0,commitCount=0,sendCount=0;let lastMessage;
const listeners=[];
globalThis.chrome={runtime:{lastError:null,sendMessage(msg,cb){setTimeout(()=>{
 if(msg.type==='TRACE_SETTINGS')cb({ok:true,data:settings});
 else if(msg.type==='TRACE_PREPARE'){prepareCount++;lastMessage=msg.message;cb(fail?{ok:false,error:'Test server unavailable'}:{ok:true,data:{id:msg.message.id,pixel:location.origin+'/extension/icons/16.png',reader:location.origin+'/r/'+msg.message.id}});}
 else if(msg.type==='TRACE_COMMIT'){commitCount++;cb({ok:true,data:{ok:true}});}
 else cb({ok:true,data:{}});
 },35);},onMessage:{addListener(fn){listeners.push(fn);}}}};
const send=document.querySelector('[data-trace-send]');send.addEventListener('click',()=>sendCount++);
const pause=ms=>new Promise(r=>setTimeout(r,ms));const results=document.getElementById('results');
document.getElementById('run-checks').onclick=async()=>{
 const lines=[];const log=(label,pass)=>{lines.push((pass?'PASS':'FAIL')+'  '+label);results.textContent=lines.join('\n');if(!pass)throw new Error(label);};
 document.getElementById('run-checks').disabled=true;
 try{
  await pause(250);log('Compose toggle is attached',!!document.querySelector('.trace-compose-toggle'));
  if(variant==='gmail')log('Native split Send group remains intact',document.querySelector('.dC').children.length===2&&!document.querySelector('.dC .trace-compose-control')&&!!document.querySelector('.trace-compose-dock')&&!document.querySelector('tr .trace-compose-control'));
  send.click();await pause(150);log('One native send and one prepare',sendCount===1&&prepareCount===1&&commitCount===1);log('Transparent pixel only: no visible link or added text',document.querySelectorAll('[data-trace-mark] img').length===1&&document.querySelectorAll('[data-trace-mark] a').length===0&&document.querySelector('[data-trace-mark]').textContent==='');log('Metadata includes recipient, subject and provider',lastMessage.recipients[0]==='alex@example.test'&&lastMessage.subject==='A little clarity'&&lastMessage.provider===variant&&!('content' in lastMessage));
  send.click();send.click();await pause(150);log('Rapid clicks do not duplicate sending',sendCount===2&&prepareCount===2);log('Old tracking markers removed on next send',document.querySelectorAll('[data-trace-mark]').length===1);
  document.querySelector('.trace-compose-toggle').click();send.click();await pause(100);log('Per-message opt-out removes tracking',sendCount===3&&prepareCount===2&&!document.querySelector('[data-trace-mark]'));
  document.querySelector('.trace-compose-toggle').click();fail=true;send.click();await pause(150);log('Backend failure leaves native sending available',sendCount===4&&!document.querySelector('[data-trace-mark]'));fail=false;
  const editor=document.querySelector('[contenteditable=true]');editor.focus();editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));await pause(150);log('Ctrl+Enter tracks and invokes one native send',sendCount===5&&commitCount===3);
  const control=document.querySelector('.trace-compose-toggle');control.focus();control.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));await pause(100);log('Ctrl+Enter on Trace controls does not send',sendCount===5);
  settings.enabled=false;listeners.forEach(fn=>fn({type:'TRACE_SETTINGS_CHANGED'}));await pause(100);send.click();await pause(100);log('Global pause leaves sending untouched',sendCount===6&&!document.querySelector('[data-trace-mark]'));
  results.className='pass';results.textContent+='\n\nAll '+lines.length+' checks passed. No mail was sent.';
 }catch(e){results.className='fail';results.textContent+='\nStopped: '+e.message;}
};
