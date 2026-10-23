(() => {
  if(globalThis.__tracePreviewGuard)return;globalThis.__tracePreviewGuard=true;
  let base='https://trace.apps.austinjiang.com';
  const inspect=img=>{
    if(img.closest('[contenteditable="true"]'))return;
    const values=['src','data-src','data-original-src','data-trace-original-src'].map(a=>img.getAttribute(a)||'');
    const id=values.map(v=>TraceTracking.pixelId(v,base)).find(Boolean);if(!id)return;
    if(img.getAttribute('src')){img.dataset.traceOriginalSrc=img.getAttribute('src');img.dataset.tracePreviewSeq=String((Number(img.dataset.tracePreviewSeq)||0)+1);}
    img.dataset.traceOwnId=id;img.removeAttribute('src');img.removeAttribute('srcset');img.hidden=true;
  };
  const scan=node=>{if(node.nodeType!==1)return;if(node.tagName==='IMG')inspect(node);for(const img of node.querySelectorAll('img'))inspect(img);};
  new MutationObserver(changes=>{for(const c of changes){if(c.type==='attributes')inspect(c.target);else for(const node of c.addedNodes)scan(node);}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset','data-original-src','data-src']});
  try{chrome.runtime.sendMessage({type:'TRACE_SETTINGS'},r=>{if(r?.ok&&r.data.serverUrl){base=r.data.serverUrl;if(document.documentElement)scan(document.documentElement);}});}catch{}
})();
