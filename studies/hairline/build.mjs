import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { assemble } from '../../.agents/skills/hairline-create/build.mjs';
import { validate } from '../../.agents/skills/hairline-create/validate.mjs';
const source=readFileSync(new URL('./folios.js',import.meta.url),'utf8');
const canonical=assemble(source);
const issues=validate(canonical);
if(issues.length)throw new Error(issues.join('\n'));
// The user requested a dark-only embedding. Validate the canonical figure first,
// then adapt this owned shell; the pinned upstream bench and engine stay byte-identical.
const html=canonical.replace('<html lang="en">','<html lang="en" data-theme="dark">')
 .replace('<title>Hairline figure</title>','<title>Hairline figure</title><meta name="color-scheme" content="dark">')
 .replace(/    <span class="label">theme<\/span>\n    <button id="theme"[^>]*><\/button>\n/,'')
 .replace(/  \/\* the theme: the system[\s\S]*?(?=  \/\* \?intensity)/,'')
 .replace('</style>','.study-back { display:inline-flex; align-items:center; min-height:44px; margin-bottom:16px; color:var(--muted); text-decoration:none; } .study-back:focus-visible { outline:2px solid var(--ink); outline-offset:4px; } </style>')
 .replace('<main>','<main><nav aria-label="Study navigation"><a class="study-back" href="/studies">← Motion studies</a></nav>');
if(html.includes('id="theme"'))throw new Error('Dark Hairline adapter: theme control was not removed.');
const out=new URL('../../public/studies/hairline/',import.meta.url);
mkdirSync(out,{recursive:true});
writeFileSync(new URL('index.html',out),html);
copyFileSync(new URL('../../.agents/skills/hairline-create/LICENSE',import.meta.url),new URL('LICENSE',out));
console.log('Hairline folios built with unchanged kernel; canonical validator passed; owned dark-only shell applied.');
