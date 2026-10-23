export const icons={
 overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/>',shield:'<path d="M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',link:'<path d="m10 13 4-4m-7 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 0) scale(.9)"/>'
};
export const icon=name=>`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.mail}</svg>`;
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function relative(t){const diff=Date.now()-t;if(diff<60000)return 'Just now';if(diff<3600000)return `${Math.floor(diff/60000)}m ago`;if(diff<86400000)return `${Math.floor(diff/3600000)}h ago`;if(diff<7*86400000)return `${Math.floor(diff/86400000)}d ago`;return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'});}
export const isExtension=!!globalThis.chrome?.runtime?.id;
export async function rpc(message){if(!isExtension)throw new Error('Open this page inside the installed extension.');const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw new Error(result?.error||'Unable to reach Trace.');return result.data;}
export function demoMessages(){
 const now=Date.now();const seed=[['Brand direction — a few thoughts','alex@studiofield.co','gmail',4,0,32],['Q4 proposal & next steps','sarah@northstar.design','outlook',2,0,97],['A quick follow-up','james@linearstudio.io','gmail',0,0,180],['Website launch checklist','mia@forma.co','gmail',3,0,360],['Partnership possibilities','oliver@arcandco.com','outlook',0,0,950],['Re: Let’s make something good','emma@slowstudio.design','gmail',1,0,1700],['Project notes for Friday','noah@builtbyfolk.co','outlook',2,0,2900],['Thanks for the conversation','ava@newwave.studio','gmail',0,0,5700]];
 return seed.map(([subject,recipient,provider,signals,_unused,minutes],i)=>{
  const created=now-minutes*60000;const events=[...Array.from({length:signals},(_,j)=>({kind:'image',source:j%2?'proxy-hint':'unverified',at:created+(j+1)*120000}))];
  return {id:String(i+1).padStart(48,'0'),subject,recipients:[recipient],provider,signals,state:'send_requested',created,committed:created+1000,latest:Math.max(created,...events.map(e=>e.at)),events:events.sort((a,b)=>b.at-a.at)};
 });
}
