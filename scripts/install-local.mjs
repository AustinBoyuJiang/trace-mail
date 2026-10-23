import {readFile,cp,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let config;
try{config=JSON.parse(await readFile(path.join(root,'.trace-local.json'),'utf8'));}
catch{throw new Error('Create .trace-local.json with an absolute extensionInstallDir first.');}
const destination=config.extensionInstallDir;
if(typeof destination!=='string'||!path.isAbsolute(destination)||path.basename(destination)!=='extension')throw new Error('extensionInstallDir must be an absolute path ending in extension.');
const source=await realpath(path.join(root,'extension'));
const resolved=await realpath(destination);
if(resolved===source||source.startsWith(resolved+path.sep)||resolved.startsWith(source+path.sep))throw new Error('Choose a separate existing browser installation directory.');
await cp(source,resolved,{recursive:true,force:true});
console.log(`Updated ${resolved}. Reload Trace in the browser extension manager, then reload mailbox tabs.`);
