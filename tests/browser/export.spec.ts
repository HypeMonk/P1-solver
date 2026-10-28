import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fixtureArchive,fixtureMarket} from '../fixture';

test('research download refreshes public data, includes shared peer fields, and excludes secrets',async({page})=>{
  await page.clock.install({time:new Date('2026-10-27T14:00:00Z')});
  let newer=false,requests=0,posts=0;
  const archive=structuredClone(fixtureArchive);archive.publishedAt='2026-10-27T13:00:00Z';archive.days=archive.days.map(d=>({...d,publishedAt:archive.publishedAt,...(d.date==='2026-10-26'?{spend:'10',availableAt:archive.publishedAt}:{})}));
  await page.route('**/data/archive.json',r=>r.fulfill({json:fixtureArchive}));
  await page.route('**/data/market.json',r=>r.fulfill({json:fixtureMarket}));
  await page.route('**/api/data*',r=>{requests++;return r.fulfill({json:{archive:newer?archive:fixtureArchive}});});
  await page.route('https://tds-network-games.sanand.workers.dev/prediction-market/api/**',r=>{
    const path=new URL(r.request().url()).pathname;
    if(path.endsWith('/session'))return r.fulfill({json:{token:'game-session-secret',student_id:'owner@example.test'}});
    if(path.endsWith('/portfolio'))return r.fulfill({json:{verified:true,forecasts:[{entryId:'mine',probabilities:fixtureMarket.outcomes.map(o=>o.id==='5000-10000c'?1:0),reason:'Private own explanation'}],journal:[]}});
    if(path.endsWith('/history'))return r.fulfill({json:{feed:[{entryId:'mine',choicePublic:true,explanationPublic:true,reason:'Private own explanation'},{entryId:'peer',actor:'peer@example.test',choicePublic:true,explanationPublic:true,outcomeId:'10000-20000c',reason:'Shared peer expects more usage.'}]}});
    if(path.endsWith('/markets'))return r.fulfill({json:{markets:[fixtureMarket]}});
    return r.fulfill({json:{config:fixtureMarket,settled:false,probabilities:fixtureMarket.outcomes.map(o=>o.id==='10000-20000c'?1:0)}});
  });
  page.on('request',r=>{if(r.method()==='POST')posts++;});
  await page.goto('/');await expect(page.getByRole('button',{name:'Copy reason',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Save to game',exact:true}).click();await page.locator('#launch-token').fill('game-entry-secret');await page.getByRole('button',{name:'Connect account',exact:true}).click();await expect(page.locator('.identity')).toHaveText('owner@example.test');
  await page.getByRole('button',{name:'Improve reason',exact:true}).click();await page.locator('#api-key').fill('aipipe-api-secret');
  await page.getByRole('button',{name:'My prediction',exact:true}).click();newer=true;
  const before=requests;
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download everything for my own AI',exact:true}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('q1-llm-research.txt');
  const text=await readFile((await download.path())!,'utf8');expect(requests).toBeGreaterThan(before);expect(text).toContain('2026-10-27T13:00:00Z');expect(text).toContain('Shared peer expects more usage.');expect(text).toContain('export function forecast');expect(text).toContain('reviewSystem');
  for(const privateText of ['game-session-secret','game-entry-secret','aipipe-api-secret','owner@example.test','peer@example.test','Private own explanation'])expect(text).not.toContain(privateText);
  expect(posts).toBe(1);
});

test('a failed export refresh produces a labeled snapshot, not invented fresh evidence',async({page})=>{
  await page.clock.install({time:new Date('2026-10-27T14:00:00Z')});
  let fail=false;
  await page.route('**/data/archive.json',r=>fail?r.abort():r.fulfill({json:fixtureArchive}));
  await page.route('**/data/market.json',r=>r.fulfill({json:fixtureMarket}));
  await page.route('**/api/data*',r=>r.fulfill({json:{archive:fixtureArchive}}));
  await page.route('https://tds-network-games.sanand.workers.dev/prediction-market/api/markets',r=>r.fulfill({json:{markets:[fixtureMarket]}}));
  await page.goto('/');await expect(page.getByRole('button',{name:'Copy reason',exact:true})).toBeEnabled();fail=true;
  const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download everything for my own AI',exact:true}).click();const file=await waiting;
  const text=await readFile((await file.path())!,'utf8');expect(text).toContain('Public-data refresh failed');expect(text).toContain('Not connected');expect(text).toContain('"liveMarketRulesChecked": false');
});
