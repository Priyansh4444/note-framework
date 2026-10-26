import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ARM, TARGETS } from './model.js';
const here = fileURLToPath(new URL('.', import.meta.url));
const screw = (x,y,r=4) => `<g transform="translate(${x} ${y})"><circle r="${r+1}" fill="#111710" stroke="#89917c" stroke-width="1"/><path d="M-${r*.55} ${r*.4} ${r*.55} -${r*.4}" stroke="#c4cab7" stroke-width="1.2"/></g>`;
const bolts=(cx,cy,r,n=8)=>Array.from({length:n},(_,i)=>screw(cx+Math.cos(i*2*Math.PI/n)*r,cy+Math.sin(i*2*Math.PI/n)*r,3)).join('');
const bearing=(x,y,r)=>`<g transform="translate(${x} ${y})"><circle r="${r}" fill="#10170f" stroke="#8a9675" stroke-width="1.5"/><circle r="${r-5}" fill="url(#steel)" stroke="#e9ecdd" stroke-width="1"/><circle r="${r-10}" fill="#4b5340" stroke="#242c1f" stroke-width="2"/><circle r="${r-14}" fill="url(#ivory)" stroke="#a4ac94"/><path d="M-${r-18} 0 H${r-18}" stroke="#7f8a6b"/>${bolts(0,0,r-3,8)}<circle r="4" fill="#242c1f" stroke="#dae2c6"/></g>`;
const ticks = Array.from({length:33},(_,i)=>`<path d="M${92+i*25} 44v${i%4===0?10:5} M${92+i*25} 552v-${i%4===0?10:5}"/>`).join('');
const marks = TARGETS.map((t,i)=>`<g transform="translate(${t.x} ${t.y})" opacity=".55"><path d="M-10 0h20 M0 -10v20" stroke="#98a785"/><circle r="18" fill="none" stroke="#667452" stroke-dasharray="2 5"/><circle r="3" fill="#a0b47e"/></g>`).join('');
const svg=`<svg id="mechanism" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg" tabindex="0" role="application" aria-label="Mechanical arm. Drag its tool or use arrow keys to move it." aria-describedby="keyboard-help">
<defs><linearGradient id="ivory" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f0f0dc"/><stop offset=".47" stop-color="#d9debe"/><stop offset="1" stop-color="#b6bea0"/></linearGradient><linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7e8a6b"/><stop offset=".38" stop-color="#d4dbc3"/><stop offset=".52" stop-color="#909c7d"/><stop offset="1" stop-color="#3d4933"/></linearGradient><linearGradient id="base" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="#3b4433"/><stop offset="1" stop-color="#222a20"/></linearGradient><pattern id="dots" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".8" fill="#8a9473" opacity=".22"/></pattern><pattern id="warning" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="12" fill="#b9c785"/></pattern><filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="1" dy="8" stdDeviation="6" flood-color="#000" flood-opacity=".42"/></filter></defs>
<rect x="70" y="40" width="860" height="520" fill="url(#dots)"/><g stroke="#596149" stroke-width="1" fill="none" opacity=".55">${ticks}<path d="M77 67V44h23 M900 44h23v23 M77 532v23h23 M900 555h23v-23"/></g>
<path id="workspace" fill="#b9d581" fill-opacity=".018" stroke="#7e8d61" stroke-opacity=".3" stroke-dasharray="3 7"/>
${marks}
<g filter="url(#shadow)"><path d="M580 349 850 349 862 361V513L850 525H580L568 513V361Z" fill="#0e150f" stroke="#080d08" stroke-width="3"/><path d="M575 356H850L855 361V510L850 516H575Z" fill="url(#base)" stroke="#6d7958"/><path d="M581 356H844" stroke="#c2cba7" stroke-opacity=".4"/><path d="M576 512H850" stroke="#10190e" stroke-width="3"/>
<rect x="581" y="369" width="138" height="134" rx="4" fill="#171f15" stroke="#566445"/>
<rect x="731" y="370" width="105" height="43" rx="4" fill="#10190e" stroke="#566445"/>
<path d="M742 385h24 M742 392h45 M742 399h35" stroke="#91a96b" stroke-width="3"/><circle cx="818" cy="391" r="5" fill="#cbe885"/>
<g stroke="#10170e" stroke-width="5">${Array.from({length:9},(_,i)=>`<path d="M${741+i*10} 433v28"/>`).join('')}</g><g stroke="#657451" stroke-width="1">${Array.from({length:9},(_,i)=>`<path d="M${743+i*10} 433v28"/>`).join('')}</g>
<rect x="734" y="479" width="100" height="17" rx="2" fill="#25301e" stroke="#627049"/><path d="M740 484h30 M740 490h47" stroke="#b1be93" stroke-width="1"/><path d="M816 481v14 M821 481v14 M826 481v14" stroke="#859568"/>
<rect x="573" y="514" width="282" height="7" fill="url(#warning)" opacity=".75"/>${screw(583,365)}${screw(843,365)}${screw(583,505)}${screw(843,505)}
<circle cx="650" cy="430" r="63" fill="#11190f" stroke="#71815a" stroke-width="2"/><circle cx="650" cy="430" r="55" fill="url(#steel)" stroke="#aab895"/><circle cx="650" cy="430" r="49" fill="#343f2b" stroke="#11190f"/><circle cx="650" cy="430" r="43" fill="none" stroke="#9aa985" stroke-dasharray="1 7" stroke-width="5"/>${bolts(650,430,55,12)}
</g>
<g id="upper" filter="url(#shadow)">
<path d="M22 17 C55 57 158 52 202 19" fill="none" stroke="#0b100b" stroke-width="9"/><path d="M22 17 C55 57 158 52 202 19" fill="none" stroke="#8f9b70" stroke-width="3"/>
<path d="M-22-30Q-40 0-22 30L181 23Q235 30 242 0Q235-30 181-23Z" fill="url(#ivory)" stroke="#10170d" stroke-width="3"/>
<path d="M29-21 177-16 M28 24 178 18" stroke="#f2f1dd" stroke-width="2" opacity=".7"/>
<path d="M46-9H164Q178-9 178 0Q178 9 164 9H46Q36 9 36 0Q36-9 46-9Z" fill="#263320" stroke="#91a079"/><path d="M46-5H151" stroke="#10190f" stroke-width="2"/>
<path d="M64-16v4 M84-16v4 M104-16v4 M124-16v4 M144-16v4" stroke="#7c8b64"/>
<path d="M33 22 58 22 58 18" fill="none" stroke="#727f5c"/><circle cx="157" cy="17" r="3" fill="#aec76d"/>
${screw(26,-18,3)}${screw(26,18,3)}${screw(184,-14,3)}${screw(184,14,3)}${bearing(0,0,32)}
</g>
<g id="forearm" filter="url(#shadow)">
<path d="M9-18 C65-47 125-38 163-13" fill="none" stroke="#10150e" stroke-width="8"/><path d="M9-18 C65-47 125-38 163-13" fill="none" stroke="#8fa476" stroke-width="2.5"/>
<path d="M-18-24Q-31 0-18 24L154 17 176 10V-10L154-17Z" fill="url(#ivory)" stroke="#11180e" stroke-width="3"/>
<path d="M29-11H143V11H29Z" fill="#c8d0ae" stroke="#758563"/><path d="M35-5H133V5H35Z" fill="#26331e"/><path d="M39-3H124" stroke="#a3b27e"/>
<path d="M49-17H128" stroke="#f0f1da" stroke-width="2"/><path d="M45 17H130" stroke="#889a6b" stroke-width="1"/>
${screw(31,0,3)}${screw(144,0,3)}${bearing(0,0,26)}
<g transform="translate(175)"><rect x="-16" y="-19" width="24" height="38" rx="4" fill="#36472a" stroke="#0e170b" stroke-width="2"/><path d="M-10-17v34 M-4-17v34 M2-17v34" stroke="#8e9d74" stroke-width="2"/><path d="M7-15H24L34-7 28-1 18-8H7 M7 15H24L34 7 28 1 18 8H7" fill="url(#steel)" stroke="#11190d" stroke-width="2"/><circle r="7" fill="#d0e996" stroke="#18230f" stroke-width="2"/><circle r="2" fill="#f4ffd7"/></g>
</g>
<g id="tool-marker" pointer-events="none"><circle r="27" fill="none" stroke="#daeaaa" stroke-width="1" stroke-dasharray="3 5" opacity=".75"/><path d="M-35 0h9 M26 0h9 M0-35v9 M0 26v9" stroke="#dcecae" stroke-width="1.3"/></g>
<circle id="tool-hit" r="34" fill="transparent" stroke="transparent" stroke-width="12" aria-hidden="true"/>
</svg>`;
let html=await readFile(here+'page.html','utf8');
const model=(await readFile(here+'model.js','utf8')).replace(/export /g,'');
const app=(await readFile(here+'app.js','utf8')).replace(/^import .*;\n/m,'');
const controls=TARGETS.map((t,i)=>`<button class="target" type="button" data-target="${t.id}" aria-pressed="${i===0}"><span class="target-icon" aria-hidden="true">${['↗','↖','⌁'][i]}</span><span><b>${t.name}</b><small>${t.note}</small></span></button>`).join('');
html=html.replace('__SVG__',svg).replace('__TARGETS__',controls).replace('__SCRIPT__',model+'\n'+app);
const output=here+'../../public/studies/mechanical-arm/index.html';
await mkdir(here+'../../public/studies/mechanical-arm',{recursive:true});
await writeFile(output,html);
console.log(`Built mechanical-arm (${Buffer.byteLength(html)} bytes), one local HTML file.`);
