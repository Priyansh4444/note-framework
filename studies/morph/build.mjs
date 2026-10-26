import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { makeMorphShapes } from '../../src/kit/patterns/morph-model.ts';

const template=await readFile(new URL('index.html',import.meta.url),'utf8');
if(template.split('/*MORPH_TARGETS*/').length!==2)throw new Error('Morph template needs exactly one geometry placeholder.');
const targets=makeMorphShapes().map(shape=>shape.contours);
const html=template.replace('/*MORPH_TARGETS*/',JSON.stringify(targets));
const output=new URL('../../public/studies/morph/',import.meta.url);
await mkdir(output,{recursive:true});
await writeFile(new URL('index.html',output),html);
console.log('Built standalone morph with canonical kit formation geometry and no runtime dependencies.');
