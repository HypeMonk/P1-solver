import {test,expect} from '@playwright/test';
import {DAY,dateKey,FEED_URL} from '../../src/core';
import {fixtureMarket} from '../fixture';

test('the real app predicts the remaining Sunday using matching historical errors',async({page})=>{
  const now=new Date('2026-11-08T13:00:00Z');
  await page.clock.install({time:now});
  const start=Date.parse('2026-11-02')-126*DAY;
  const days=Array.from({length:132},(_,i)=>{
    const time=start+i*DAY,publishedAt=new Date(time+DAY+60_000).toISOString();
    return {date:dateKey(time),spend:new Date(time).getUTCDay()===0?'70':'0',complete:true,available:true,publishedAt,availableAt:publishedAt,source:FEED_URL};
  });
  const archive={version:1,publishedAt:now.toISOString(),collectedAt:now.toISOString(),days,revisions:[],sources:[FEED_URL]};
  await page.route('**/data/archive.json',route=>route.fulfill({json:archive}));
  await page.route('**/data/market.json',route=>route.fulfill({json:fixtureMarket}));
  await page.route('**/api/data*',route=>route.fulfill({json:{archive}}));
  await page.route('https://tds-network-games.sanand.workers.dev/prediction-market/api/markets',route=>route.fulfill({json:{markets:[fixtureMarket]}}));
  const errors:string[]=[],posts:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
  await page.goto('/');
  await expect(page.locator('.range')).toHaveText('$50 to under $100');
  await expect(page.locator('#home-reason')).toHaveValue(/6 completed target days.*remaining 1 day/);
  await page.getByText('How was this estimated? (Optional details)',{exact:true}).click();
  await expect(page.getByText('12 separate matching past weeks · 1 target day still unknown.',{exact:false})).toBeVisible();
  await expect(page.getByText('We check past weeks with the same days still unknown',{exact:false})).toBeVisible();
  expect(errors).toEqual([]);expect(posts).toEqual([]);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'test-results/remaining-sunday-forecast.png',fullPage:true});
});
