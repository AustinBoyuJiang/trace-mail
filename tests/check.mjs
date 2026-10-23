import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');const manifest=JSON.parse(readFileSync(resolve(root,'extension/manifest.json'),'utf8'));
for(const f of [manifest.background.service_worker,manifest.action.default_popup,manifest.options_page.split('#')[0],...Object.values(manifest.icons),...manifest.content_scripts.flatMap(s=>[...(s.js||[]),...(s.css||[])])])if(!existsSync(resolve(root,'extension',f)))throw new Error(`Missing ${f}`);
for(const folder of ['extension','server','tests'])for(const f of readdirSync(resolve(root,folder)))if(/\.(m?js)$/.test(f))execFileSync(process.execPath,['--check',resolve(root,folder,f)],{stdio:'pipe'});
console.log('Manifest references and JavaScript syntax verified.');
