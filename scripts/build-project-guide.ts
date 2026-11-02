import { readFile,writeFile } from 'node:fs/promises';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ASSIGNMENT_URL } from '../src/core';
import { ProjectHome } from '../src/ProjectHome';
import { EXAMPLE_OFFER,P1_RULES_CHECKED,P1_SOURCE,PROJECT_QUESTIONS,offerScript } from '../src/projectQuestions';

const root=new URL('../',import.meta.url);
const css=await readFile(new URL('src/styles.css',root),'utf8');
async function page(filename:string,title:string,content:string){
  const html=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>${title}</title><style>${css}</style></head><body><main class="shell">${content}</main></body></html>\n`;
  for(const folder of ['public','share'])await writeFile(new URL(`${folder}/${filename}`,root),html);
}
const home=renderToStaticMarkup(h(ProjectHome)).replaceAll('href="#forecast"','href="./#forecast"').replace(/href="#(q[2-7])"/g,'href="$1-guide.html"')
  .replace(/<span class="phase-status [^"]+">[^<]*<\/span>/g,'')
  .replace('Status labels use your device’s time; they do not access your account.','This static homepage lists published dates, not live account status.');
await page('project-guide.html','P1 Question Guide',home);
for(const q of PROJECT_QUESTIONS.filter(q=>q.id!=='q1')){
  const content=renderToStaticMarkup(h('article',{className:'project-guides section'},
    h('a',{href:'project-guide.html',className:'back-home'},'← All P1 questions'),
    h('section',{className:'question-guide'},
      h('p',{className:'eyebrow'},`Q${q.number} · ${q.help}`),h('h1',null,q.title),h('p',{className:'fine'},q.score),h('p',null,q.summary),
      q.phases.map(phase=>h('div',{key:phase.label,className:'phase-row'},h('div',null,h('h3',null,phase.label),h('p',null,phase.dates),phase.note&&h('p',{className:'fine'},phase.note)))),
      h('h3',null,'What to do'),h('ol',{className:'steps'},q.steps.map(step=>h('li',{key:step},q.id==='q2'?step.replace('Use the helper below','Open the interactive script helper'):step))),
      h('aside',{className:'guide-note important'},h('span',{className:'note-label'},'Important'),h('ul',null,q.important.map(note=>h('li',{key:note},note)))),
      q.id==='q2'&&h('aside',{className:'example'},h('strong',null,'Example offer script · replace this with your own real service'),h('p',null,offerScript(EXAMPLE_OFFER)),h('p',{className:'fine'},'Practise aloud. Word count is not proof of a recording under 60 seconds.'),h('a',{href:'./#q2'},'Open the interactive Q2 script helper')),
      h('aside',{className:'guide-note mandatory'},h('span',{className:'note-label'},'Finish'),h('p',null,q.completion)),
      h('p',{className:'fine'},`Published rules checked ${P1_RULES_CHECKED}. Get fresh personal links from your own assignment login. This page performs no recordings, uploads, account actions or paid calls.`),
      h('div',{className:'actions'},h('a',{href:ASSIGNMENT_URL,target:'_blank',rel:'noreferrer',className:'button'},'Open official assignment'),h('a',{href:P1_SOURCE,target:'_blank',rel:'noreferrer'},'Official question source'))
    )
  ));
  await page(`${q.id}-guide.html`,`Q${q.number} Student Guide`,content);
}
console.log('Question homepage and six separate static guides generated from the app’s published rules.');
