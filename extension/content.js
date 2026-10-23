(() => {
  if(globalThis.__traceMailInstalled)return;globalThis.__traceMailInstalled=true;
  const gmail=location.hostname==='mail.google.com'||document.documentElement.dataset.traceFixture==='gmail';
  const provider=gmail?'gmail':'outlook';
  const editorSelector=gmail?'[contenteditable="true"][g_editable="true"], [contenteditable="true"][aria-label="Message Body"], [contenteditable="true"][aria-label="Message body"]':'[contenteditable="true"][role="textbox"], [contenteditable="true"][aria-label*="Message body" i], [contenteditable="true"][data-editor-type="editor"]';
  const sendSelector=gmail?'.aoO[role="button"], [role="button"][data-tooltip^="Send"], button[data-trace-send]':'button[aria-label="Send"], button[aria-label^="Send ("], button[title="Send"], button[data-automationid="Send"], button[data-testid="SendButton"], button[data-trace-send]';
  const states=new Set();const byEditor=new WeakMap();let prefs={enabled:true,connected:false},scanQueued=false;
  function request(msg){return new Promise((resolve,reject)=>{try{chrome.runtime.sendMessage(msg,result=>{if(chrome.runtime.lastError)return reject(new Error(chrome.runtime.lastError.message));if(!result?.ok)return reject(new Error(result?.error||'Trace is unavailable'));resolve(result.data);});}catch(e){reject(e);}});}
  function toast(text){document.querySelector('.trace-toast')?.remove();const el=document.createElement('div');el.className='trace-toast';el.role='status';el.textContent=text;document.body.append(el);setTimeout(()=>el.remove(),6500);}
  function update(s){const active=prefs.enabled&&s.enabled;s.toggle.dataset.active=String(active);s.toggle.setAttribute('aria-pressed',String(active));s.toggle.textContent=!prefs.connected?'Connect Trace':!prefs.enabled?'Trace paused':active?'Trace on':'Trace off';s.toggle.title=!prefs.connected?'Connect your tracking server once in Settings':!prefs.enabled?'Automatic tracking is paused in Trace Settings':active?'Track this email with a transparent image':'Send this email without tracking';}
  async function loadPrefs(){try{prefs=await request({type:'TRACE_SETTINGS'});document.documentElement.dataset.traceProxyProtection=String(!!prefs.proxyProtection);document.documentElement.dataset.traceProxyVerified=String(prefs.proxyRulesVerified);for(const s of states)update(s);if(prefs.connected)refreshStatus();}catch{}}
  function findRoot(editor){
    // Gmail's nearest body/toolbar table excludes Subject and recipients.
    // Prefer the complete dialog, keeping simultaneous compose windows separate.
    const dialog=editor.closest('[role="dialog"]');
    if(dialog&&dialog.querySelectorAll(editorSelector).length===1){const send=dialog.querySelector(sendSelector);if(send)return {root:dialog,send};}
    let fallback=null;
    for(let root=editor.parentElement,depth=0;root&&depth<36;depth++,root=root.parentElement){
      if(root===document.body||root.querySelectorAll(editorSelector).length>1)break;
      const send=root.querySelector(sendSelector);if(!send)continue;
      fallback||={root,send};
      if(root.querySelector('input[name="subjectbox"],input[name="subject"],input[aria-label*="subject" i]'))return {root,send};
      if(root.getAttribute('role')==='region')return {root,send};
    }
    return fallback;
  }
  function scan(){scanQueued=false;
    for(const s of states)if(!s.editor.isConnected||!s.send.isConnected){(s.cell||s.control).remove();s.header?.classList.remove('trace-compose-header');states.delete(s);byEditor.delete(s.editor);}
    for(const editor of document.querySelectorAll(editorSelector)){
      if(byEditor.has(editor)||editor.closest('.trace-compose-control')||/search|recipient|subject/i.test(editor.getAttribute('aria-label')||''))continue;
      const found=findRoot(editor);if(!found)continue;
      // Plain-text mode cannot reliably carry a tracking image. Leave sending native.
      if(editor.getAttribute('data-trace-plain')==='true')continue;
      const control=document.createElement('span');control.className='trace-compose-control';control.contentEditable='false';
      const toggle=document.createElement('button');toggle.type='button';toggle.className='trace-compose-toggle';
      const open=document.createElement('button');open.type='button';open.className='trace-compose-open';open.textContent='↗';open.title='Open Trace';open.setAttribute('aria-label','Open Trace dashboard');
      toggle.tabIndex=open.tabIndex=Math.max(0,found.send.tabIndex);
      control.dataset.provider=provider;control.setAttribute('role','group');control.setAttribute('aria-label','Trace email tracking');
      control.append(toggle,open);
      let cell=null;const group=gmail?found.send.closest('.dC'):null;const header=gmail?found.root.querySelector('.Hp'):null;
      // Gmail fixes the bottom toolbar height and shrinks its flex children.
      // The title area has room without shifting or overlapping the native tools.
      if(header){header.classList.add('trace-compose-header');cell=document.createElement('div');cell.className='trace-compose-dock';cell.append(control);header.append(cell);}
      else (group||found.send).insertAdjacentElement('afterend',control);
      const s={...found,editor,control,cell,header,toggle,enabled:true,busy:false,bypass:false};states.add(s);byEditor.set(editor,s);update(s);
      // Keep native split-Send controls, editor selection and mailbox shortcuts intact.
      for(const event of ['pointerdown','mousedown','click','keydown'])control.addEventListener(event,e=>e.stopPropagation());
      toggle.addEventListener('mousedown',e=>e.preventDefault());
      toggle.addEventListener('click',e=>{e.preventDefault();if(!prefs.connected){request({type:'TRACE_OPEN'}).catch(()=>{});return;}if(!prefs.enabled){toast('Automatic tracking is paused in Trace Settings.');return;}s.enabled=!s.enabled;update(s);});
      open.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();request({type:'TRACE_OPEN'}).catch(()=>{});});
    }
    paintStatus();hideOwnPreview();
  }
  function queueScan(){if(!scanQueued){scanQueued=true;setTimeout(scan,180);}}
  function extract(s){
    const subject=s.root.querySelector('input[name="subjectbox"],input[name="subject"],input[placeholder*="subject" i],input[aria-label*="subject" i]');
    const recipients=new Set();
    const emailPattern=/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    for(const el of s.root.querySelectorAll('[email],[data-email-address],[data-hovercard-id],input[name="to"],input[name="cc"],input[name="bcc"],input[aria-label$="recipients" i],[data-trace-recipient],span[title*="@"],button[title*="@"]')){
      if(s.editor.contains(el))continue;
      const text=[el.getAttribute('email'),el.getAttribute('data-email-address'),el.getAttribute('data-hovercard-id'),el.getAttribute('title'),el.getAttribute('data-trace-recipient'),el.value].filter(Boolean).join(' ');
      for(const match of text.matchAll(emailPattern))recipients.add(match[0]);
    }
    const threadSubject=gmail?[...document.querySelectorAll('h2.hP')].find(el=>el.getClientRects().length)?.textContent:null;
    return {subject:subject?.value||threadSubject||'(No subject)',recipients:[...recipients],provider};
  }
  function stripOld(s){
    for(const el of s.editor.querySelectorAll('[data-trace-mark],img[src],img[data-trace-own-id],a[href]')){
      const value=el.getAttribute('src')||el.getAttribute('href')||'';
      if(el.hasAttribute('data-trace-mark') || el.hasAttribute('data-trace-own-id') || TraceTracking.pixelId(value,prefs.serverUrl)){const wrapper=el.closest('[data-trace-mark]');(wrapper||el).remove();}
    }
  }
  function inject(s,data){
    stripOld(s);
    const marker=document.createElement('span');marker.dataset.traceMark=data.id;marker.contentEditable='false';
    const img=document.createElement('img');img.src=data.pixel;img.width=1;img.height=1;img.alt='';img.setAttribute('aria-hidden','true');img.style.cssText='width:1px;height:1px;border:0;opacity:0;';marker.append(img);
    // Use the editor's native editing path where available, then notify the host.
    s.editor.focus();const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(s.editor);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
    let inserted=false;try{inserted=document.execCommand('insertHTML',false,marker.outerHTML);}catch{}
    if(!inserted)s.editor.append(marker);
    s.editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));
  }
  function nativeSend(s){if(!s.send.isConnected){toast('Compose window changed. Please press Send again.');return false;}s.bypass=true;try{s.send.click();return true;}finally{s.bypass=false;}}
  async function send(s){
    if(s.busy)return;s.busy=true;s.toggle.disabled=true;s.toggle.textContent='Preparing…';
    const id=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
    try{
      stripOld(s);const meta=extract(s);
      const data=await request({type:'TRACE_PREPARE',message:{...meta,id}});
      if(!s.editor.isConnected||!s.send.isConnected)throw new Error('Compose window changed. Please send again.');
      inject(s,data);
      if(nativeSend(s))request({type:'TRACE_COMMIT',id}).catch(()=>{});
    }catch(e){
      stripOld(s);toast('Sending without tracking: '+e.message);nativeSend(s);
    }finally{s.busy=false;s.toggle.disabled=false;update(s);}
  }
  document.addEventListener('click',e=>{
    const button=e.target instanceof Element?e.target.closest(sendSelector):null;if(!button)return;
    const s=[...states].find(item=>item.send===button);if(!s||s.bypass)return;
    if(s.busy){e.preventDefault();e.stopImmediatePropagation();return;}
    if(!prefs.enabled||!s.enabled||!prefs.connected){stripOld(s);return;}
    e.preventDefault();e.stopImmediatePropagation();send(s);
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'||!(e.ctrlKey||e.metaKey)||e.isComposing)return;
    if(e.composedPath().some(el=>el.classList?.contains('trace-compose-control')))return;
    const s=[...states].find(item=>item.root.contains(document.activeElement));if(!s||s.bypass||!prefs.enabled||!s.enabled||!prefs.connected)return;
    e.preventDefault();e.stopImmediatePropagation();send(s);
  },true);
  let tracked=[],bindings={},statusBusy=false,lastStatus=0,viewingKey=null,viewingRow=null,statusState='loading';
  const pendingBindings=new Set(),selfViewed=new Map(),previewSeen=new WeakMap();
  const rowSelector=gmail?'tr.zA':'[role="option"][data-convid]';
  function rowKey(row){return gmail?row.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id'):row.getAttribute('data-convid');}
  function sentView(){return gmail?/^#sent(?:\/|$)/.test(location.hash):/\/mail\/sentitems(?:\/|$)/i.test(location.pathname);}
  function rowMeta(row){
    const key=rowKey(row);if(!key)return null;
    const subject=gmail?row.querySelector('[data-legacy-thread-id]')?.textContent:row.querySelector('.TtcXM,[data-trace-subject]')?.textContent;
    const date=gmail?row.querySelector('.xW [title]')?.getAttribute('title'):[...row.querySelectorAll('[title]')].map(el=>el.getAttribute('title')).find(t=>/\d{1,2}:\d{2}/.test(t)&&Number.isFinite(Date.parse(t)));
    const recipients=[...new Set([...row.querySelectorAll('[email]')].map(el=>(el.getAttribute('email')||'').toLowerCase()).filter(Boolean))];
    return {key,subject:subject||'',at:Date.parse(TraceTracking.normalize(date)),recipients,element:row};
  }
  async function refreshStatus(force=false){
    if(!prefs.connected||statusBusy||(!force&&Date.now()-lastStatus<10000))return;
    statusBusy=true;
    try{const result=await request({type:'TRACE_STATUS'});tracked=result.messages||[];bindings=result.bindings||{};lastStatus=Date.now();statusState='ready';paintStatus();hideOwnPreview();}
    catch{statusState='offline';paintStatus();}
    finally{statusBusy=false;}
  }
  function remember(key,ids,metadata){
    const signature=key+':'+ids.join(',');if(pendingBindings.has(signature)||(bindings[provider+':'+key]||[]).join(',')===ids.join(','))return;
    pendingBindings.add(signature);
    request({type:'TRACE_BIND',key,ids,...(metadata?{metadata:{subject:metadata.subject,recipients:metadata.recipients}}:{})}).then(()=>{bindings[provider+':'+key]=[...new Set([...(bindings[provider+':'+key]||[]),...ids])];paintStatus();}).catch(()=>{}).finally(()=>pendingBindings.delete(signature));
  }
  function selfView(ids){
    const fresh=[...new Set(ids)].filter(id=>/^[a-f0-9]{48}$/.test(id)&&Date.now()-(selfViewed.get(id)||0)>10000).slice(0,25);if(!fresh.length)return;
    for(const id of fresh)selfViewed.set(id,Date.now());
    request({type:'TRACE_SELF_VIEW',ids:fresh}).then(()=>refreshStatus(true)).catch(()=>{for(const id of fresh)selfViewed.delete(id);});
  }
  function paintStatus(){
    if(!prefs.connected||!sentView()){for(const el of document.querySelectorAll('.trace-status-cell,.trace-list-status'))el.remove();return;}
    const rows=[...document.querySelectorAll(rowSelector)].filter(row=>row.getClientRects().length).map(rowMeta).filter(Boolean);
    const matches=TraceTracking.matchRows(rows,tracked,bindings,provider);
    for(const row of rows){
      const ids=matches.get(row.key)||[],records=tracked.filter(m=>ids.includes(m.id));let badge=row.element.querySelector('.trace-list-status');
      if(!records.length){
        if(badge?.tagName==='BUTTON'){badge.remove();badge=null;}
        if(!badge){badge=document.createElement('span');badge.className='trace-list-status';mountBadge(row.element,badge);}
        badge.dataset.state=statusState==='ready'?'empty':statusState;badge.dataset.provider=provider;badge.dataset.signal='false';
        const label=statusState==='loading'?'Loading…':statusState==='offline'?'Offline':'No data';if(badge.textContent!==label)badge.textContent=label;
        badge.title=statusState==='ready'?'No linked Trace data. Mail sent before tracking was enabled cannot be tracked retroactively.':statusState==='offline'?'Trace could not refresh. Check your server connection.':'Loading Trace status';
        continue;
      }
      if(badge?.tagName!=='BUTTON'){badge?.remove();badge=null;}
      remember(row.key,ids);
      const withSignal=records.filter(m=>m.signals>0).length;
      const label=records.length>1?`${withSignal}/${records.length} with signals`:withSignal?'Open signal':'No signal yet';
      const count=records.reduce((sum,m)=>sum+m.signals,0),excluded=records.reduce((sum,m)=>sum+(m.excluded||0),0);
      const title=`Trace · ${records.length>1?'Thread: ':''}${count} image-load signal${count===1?'':'s'}${excluded?` · ${excluded} excluded or uncertain`:''}. Click for details. Images may be blocked or cached; this is not proof of reading.`;
      if(!badge){
        badge=document.createElement('button');badge.type='button';badge.className='trace-list-status';badge.dataset.provider=provider;
        badge.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();request({type:'TRACE_OPEN',id:badge.dataset.id}).catch(()=>{});});
        for(const event of ['pointerdown','mousedown'])badge.addEventListener(event,e=>e.stopPropagation());
        badge.addEventListener('keydown',e=>e.stopPropagation());
        mountBadge(row.element,badge);
      }
      if(badge.textContent!==label)badge.textContent=label;
      if(badge.title!==title)badge.title=title;
      badge.dataset.signal=String(withSignal>0);badge.dataset.id=records.sort((a,b)=>b.committed-a.committed)[0].id;
    }
  }
  function mountBadge(row,badge){
    if(gmail){let cell=row.querySelector('.trace-status-cell');if(!cell){const date=row.querySelector('td.xW');if(!date)return;cell=document.createElement('td');cell.className='trace-status-cell';date.insertAdjacentElement('beforebegin',cell);}cell.append(badge);}
    else row.querySelector('.nf3X_,[data-trace-subject-line]')?.append(badge);
  }
  // Notify the collector before a known Sent row opens. The early preview guard
  // also catches direct, encoded and proxy URLs as they are rendered.
  document.addEventListener('pointerdown',e=>{
    const row=e.target instanceof Element?e.target.closest(rowSelector):null;
    if(row&&!e.target.closest('.trace-list-status')){viewingKey=rowKey(row);viewingRow=rowMeta(row);selfView(bindings[provider+':'+viewingKey]||[]);}
  },true);
  function hideOwnPreview(){
    if(!prefs.serverUrl)return;
    const ids=new Set(),fresh=[];
    for(const img of document.querySelectorAll('img[src],img[data-trace-own-id]')){
      if(img.closest('[contenteditable="true"]'))continue;
      const id=img.dataset.traceOwnId||TraceTracking.pixelId(img.getAttribute('src'),prefs.serverUrl);if(!id)continue;
      ids.add(id);if(img.getAttribute('src')){img.dataset.traceOriginalSrc=img.getAttribute('src');img.dataset.tracePreviewSeq=String((Number(img.dataset.tracePreviewSeq)||0)+1);}if(img.dataset.traceOwnId!==id)img.dataset.traceOwnId=id;img.removeAttribute('src');img.hidden=true;
      const seen=id+':'+(img.dataset.tracePreviewSeq||'0');if(previewSeen.get(img)!==seen){previewSeen.set(img,seen);fresh.push(id);}
    }
    if(ids.size){
      const key=gmail?(![...document.querySelectorAll(rowSelector)].some(row=>row.getClientRects().length)?viewingKey:null):document.querySelector('[data-convid][aria-selected="true"]')?.getAttribute('data-convid');
      const owned=[...ids].filter(id=>tracked.some(m=>m.id===id));if(key&&owned.length)remember(key,owned,owned.length===1?viewingRow:null);
      selfView(fresh);
    }
  }
  new MutationObserver(()=>{queueScan();hideOwnPreview();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-trace-own-id','data-trace-preview-seq']});
  chrome.runtime.onMessage.addListener(msg=>{if(msg.type==='TRACE_SETTINGS_CHANGED')loadPrefs();});
  window.addEventListener('hashchange',()=>{queueScan();refreshStatus();});
  window.addEventListener('popstate',()=>{queueScan();refreshStatus();});
  const statusTimer=setInterval(()=>{if(!document.hidden)refreshStatus();},30000);
  window.addEventListener('pagehide',()=>clearInterval(statusTimer));
  loadPrefs();scan();
})();
