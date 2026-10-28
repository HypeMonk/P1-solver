import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Guide } from '../src/Guide';

const root=new URL('../',import.meta.url);
const css=await readFile(new URL('src/styles.css',root),'utf8');
const content=renderToStaticMarkup(createElement(Guide));
const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>Q1 Student Guide</title><style>${css}</style></head><body><main class="shell">${content}</main></body></html>\n`;
for(const folder of ['public','share'])await mkdir(fileURLToPath(new URL(`${folder}/`,root)),{recursive:true});
await writeFile(new URL('public/guide.html',root),html);
await writeFile(new URL('share/student-guide.html',root),html);
console.log('Standalone guide generated from the same component used in the app.');
