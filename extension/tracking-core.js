(() => {
  const normalize=value=>String(value||'').replace(/[\u202f\u00a0]/g,' ').replace(/\s+/g,' ').trim();
  function pixelId(value,base){
    if(!base)return null;let text=String(value||'');
    for(let i=0;i<3;i++){
      const at=text.indexOf(base+'/t/');if(at>=0){const found=text.slice(at+base.length+3).match(/^([a-f0-9]{48})\.gif(?:[?#\s"']|$)/);if(found)return found[1];}
      try{const decoded=decodeURIComponent(text);if(decoded===text)break;text=decoded;}catch{break;}
    }return null;
  }
  function matchRows(rows,messages,bindings,provider){
    const known=messages.filter(m=>m.provider===provider&&m.committed);const result=new Map(),candidates=new Map();
    for(const row of rows){
      const linked=(bindings[provider+':'+row.key]||[]).filter(id=>known.some(m=>m.id===id));
      if(linked.length){result.set(row.key,linked);continue;}
      if(!Number.isFinite(row.at))continue;
      const matches=known.filter(m=>normalize(m.subject)===normalize(row.subject)&&Math.abs(m.committed-row.at)<=90000&&(!row.recipients.length||m.recipients.some(r=>row.recipients.includes(r.toLowerCase()))));
      if(matches.length===1)candidates.set(row.key,matches[0].id);
    }
    // A timestamp and subject match must be unique in both directions.
    for(const [key,id] of candidates)if([...candidates.values()].filter(x=>x===id).length===1&&![...result.values()].some(ids=>ids.includes(id)))result.set(key,[id]);
    return result;
  }
  globalThis.TraceTracking=Object.freeze({normalize,pixelId,matchRows});
})();
