import {test,expect} from '@playwright/test';
import {fixtureArchive,fixtureMarket} from '../fixture';

for(const edited of [false,true])test(`automatic refresh ${edited?'preserves an edited draft':'updates an untouched solver draft'} without AI or submission`,async({page})=>{
  await page.clock.install({time:new Date('2026-10-27T14:00:00Z')});
  let changed=false;let posts=0;
  const newer=structuredClone(fixtureArchive);newer.publishedAt='2026-10-27T13:00:00Z';
  newer.days=newer.days.map(d=>({...d,publishedAt:newer.publishedAt,...(d.complete&&d.date>='2026-10-20'?{spend:'150',availableAt:newer.publishedAt}:{})}));
  await page.route('**/data/archive.json',r=>r.fulfill({json:fixtureArchive}));
  await page.route('**/data/market.json',r=>r.fulfill({json:fixtureMarket}));
  await page.route('**/api/data*',r=>r.fulfill({json:{archive:changed?newer:fixtureArchive}}));
  await page.route('https://tds-network-games.sanand.workers.dev/prediction-market/api/markets',r=>r.fulfill({json:{markets:[fixtureMarket]}}));
  page.on('request',r=>{if(r.method()==='POST')posts++;});
  await page.goto('/');await expect(page.getByRole('button',{name:'Copy reason',exact:true})).toBeEnabled();
  const firstRange=await page.locator('.range').innerText();
  const firstReason=await page.locator('#home-reason').inputValue();
  const custom='My own explanation should stay unchanged until I decide to replace it.';
  if(edited)await page.locator('#home-reason').fill(custom);
  changed=true;await page.clock.fastForward(10*60_000+100);
  await expect(page.locator('.range')).not.toHaveText(firstRange);
  if(edited){await expect(page.locator('#home-reason')).toHaveValue(custom);await expect(page.getByText('A new report arrived. Your old draft is still here.',{exact:false})).toBeVisible();}
  else{await expect(page.locator('#home-reason')).not.toHaveValue(firstReason);await expect(page.locator('#home-reason')).toHaveValue(/2026-10-27 13:00 UTC/);}
  expect(posts).toBe(0);
});
