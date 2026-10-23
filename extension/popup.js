import {rpc,isExtension} from './shared.js';
let prefs={enabled:true,connected:false};
async function open(hash='overview'){if(isExtension){await chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html#'+hash)});window.close();}else location.href='dashboard.html#'+hash;}
document.getElementById('dashboard').onclick=()=>open();document.getElementById('settings').onclick=()=>open('settings');document.getElementById('brand').onclick=e=>{e.preventDefault();open();};
const toggle=document.getElementById('tracking-toggle');
function render(){toggle.setAttribute('aria-checked',String(prefs.enabled));document.getElementById('status').textContent=prefs.connected?(prefs.enabled?'Tracking on':'Tracking paused'):'Not connected';document.getElementById('description').textContent=prefs.connected?'Keep your usual sending routine. Trace quietly takes care of the rest.':'Connect your server once. Track automatically from Gmail and Outlook on the web.';}
toggle.onclick=async()=>{try{prefs=await rpc({type:'TRACE_PREFERENCES',enabled:!prefs.enabled});render();}catch(e){document.getElementById('note').textContent=e.message;}};
if(isExtension){try{prefs=await rpc({type:'TRACE_SETTINGS'});render();if(prefs.connected){const {messages}=await rpc({type:'TRACE_LIST'});document.getElementById('count').textContent=messages.filter(r=>r.signals>0).length;}}catch(e){document.getElementById('note').textContent=e.message;}}else render();
