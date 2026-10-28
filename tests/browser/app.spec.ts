import { test,expect } from '@playwright/test';
import { fixtureArchive as archive, fixtureMarket as market } from '../fixture';
const now=new Date('2026-10-27T14:00:00Z');
test.beforeEach(async({page})=>{
  await page.clock.install({time:now});
  await page.route('**/data/archive.json',route=>route.fulfill({json:archive}));
  await page.route('**/data/market.json',route=>route.fulfill({json:market}));
  await page.route('**/api/data*',route=>route.fulfill({json:{archive}}));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://tds-network-games.sanand.workers.dev/prediction-market/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/session'))return route.fulfill({json:{token:'session-secret-test',student_id:'student@example.test'}});
    if(path.endsWith('/history'))return route.fulfill({json:{feed:[{type:'observation',at:'2026-10-27T12:00:00Z',value:0},{entryId:'other-1',actor:'other@example.test',outcomeId:'10000-20000c',reason:'Another student opinion'}]}});
    if(path.endsWith('/portfolio'))return route.fulfill({json:{verified:true,journal:[],forecasts:[{entryId:'own-1',at:'2026-10-26T12:00:00Z',probabilities:market.outcomes.map(o=>o.id==='5000-10000c'?1:0),reason:'My earlier saved reason.'}]}});
    if(path.endsWith('/receipt'))return route.fulfill({json:{receipt:'signed-result-test',score:.6}});
    if(path.endsWith('/reflection'))return route.fulfill({json:{ok:true}});
    if(path.endsWith('/markets'))return route.fulfill({json:{markets:[market]}});
    return route.fulfill({json:{config:market,settled:false}});
  });
});
test('the home screen leads through three clear steps and hides technical detail',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('button',{name:'Copy reason',exact:true})).toBeEnabled();
  await expect(page.getByRole('heading',{name:'Get your range',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Read and copy your reason',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Save it in the game',exact:true})).toBeVisible();
  await expect(page.getByText('History is short and usage can change sharply.',{exact:false})).not.toBeVisible();
  await page.getByRole('button',{name:'How to play',exact:true}).click();
  await expect(page.getByRole('heading',{name:'What is the prediction game?'})).toBeVisible();
  const headings=await page.locator('.guide h3').allTextContents();
  expect(headings.indexOf('1. How to play in the official game')).toBeLessThan(headings.indexOf('2. How to play with this solver'));
  await expect(page.locator('.guide-note.optional')).toHaveCount(1);
  for(const type of ['good','important','mandatory','caution','dates'])await expect(page.locator(`.guide-note.${type}`)).toBeVisible();
  await page.getByText('Is this a random or perfect prediction? Does it need AI?',{exact:true}).click();
  await expect(page.getByText('It is evidence-based, reproducible, and does not need AI—but it is not perfect.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Advanced data',exact:true}).click();
  await expect(page.getByText('You do not need to import a file.',{exact:false})).toBeVisible();
  await expect(page.locator('#archive-import')).not.toBeVisible();
  await page.getByRole('button',{name:'My prediction',exact:true}).click();
  await page.screenshot({path:'test-results/forecast-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.locator('#theme').selectOption('dark');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/forecast-mobile-dark.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('optional direct save requires confirmation and never exposes tokens to the relay',async({page})=>{
  const posts:{url:string;body:string}[]=[];page.on('request',r=>{if(r.method()==='POST')posts.push({url:r.url(),body:r.postData()??''});});
  await page.goto('/');await page.getByRole('button',{name:'Save to game',exact:true}).click();
  await page.locator('#launch-token').fill('entry-secret-test');await page.getByRole('button',{name:'Connect account',exact:true}).click();
  await expect(page.locator('.identity')).toHaveText('student@example.test');
  await expect(page.locator('.saved-history')).toContainText('My earlier saved reason.');
  await expect(page.locator('.saved-history')).not.toContainText('Another student opinion');
  await expect(page.locator('.saved-history tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Refresh my history',exact:true}).click();
  expect(posts.filter(p=>p.url.endsWith('/reflection'))).toHaveLength(0);
  await page.getByRole('button',{name:'Review zero-credit save',exact:true}).click();
  expect(posts.filter(p=>p.url.endsWith('/reflection'))).toHaveLength(0);
  await page.getByRole('button',{name:'Confirm and save prediction',exact:true}).click();
  await expect(page.locator('.success')).toContainText('already been accepted');
  const saves=posts.filter(p=>p.url.endsWith('/reflection'));expect(saves).toHaveLength(1);expect(JSON.parse(saves[0].body).probabilities.reduce((a:number,b:number)=>a+b,0)).toBe(1);
  expect(posts.some(p=>p.url.includes('/trade'))).toBe(false);
  expect(posts.some(p=>p.url.startsWith('http://127.0.0.1'))).toBe(false);
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  await page.getByRole('button',{name:'Retrieve official result code'}).click();await expect(page.locator('#receipt')).toHaveValue('signed-result-test');
  await page.reload();await expect(page.getByRole('button',{name:'Connect account',exact:true})).toBeVisible();
});
const answer={verdict:'uncertain',suggestedOutcome:'5000-10000c',explanation:'I choose this range from the completed reports, with uncertainty about future usage.',concerns:['Short history'],evidenceDates:['2026-10-26'],changeTrigger:'New completed reports change the estimate.'};
test('compatible-provider review remains available and applies an editable home draft',async({page})=>{
  const calls:any[]=[];
  await page.route('https://llm.example/v1/chat/completions',async route=>{
    calls.push(route.request().postDataJSON());
    await route.fulfill({json:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:50}}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Improve reason',exact:true}).click();
  await page.locator('#provider').selectOption('compatible');await page.locator('#endpoint').fill('https://llm.example/v1');await page.locator('#model').fill('test-model');await page.locator('#api-key').fill('llm-secret-test');
  await expect(page.getByRole('button',{name:'Review prediction and improve reason',exact:true})).toBeDisabled();
  await page.locator('#llm-consent').check();await page.getByRole('button',{name:'Review prediction and improve reason',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your AI-assisted draft',exact:true})).toBeVisible();expect(calls).toHaveLength(2);
  expect(calls[0].messages[1].content).not.toContain('"recommendation"');
  expect(calls[1].messages[1].content).toContain('"recommendation"');
  await page.getByRole('button',{name:'Use this draft',exact:true}).click();
  await expect(page.locator('#home-reason')).toHaveValue(answer.explanation);
  await expect(page.getByRole('heading',{name:'Save it in the game',exact:true})).toBeVisible();
});
test('AI Pipe checks its actual OpenAI route before paid inference',async({page})=>{
  const calls:any[]=[];let modelRequests=0;let usageRequests=0;
  await page.route('https://aipipe.org/**',async route=>{
    expect(route.request().headers().authorization).toBe('Bearer aipipe-test-token');
    if(route.request().url().endsWith('/usage')){usageRequests++;return route.fulfill({json:{email:'student@example.test',limit:1,cost:.02}});}
    if(route.request().url().endsWith('/models')){expect(route.request().url()).toContain('/openai/v1/models');modelRequests++;return route.fulfill({json:{data:[{id:'gpt-5.6-terra'},{id:'gpt-5.4-mini'}]}});}
    expect(route.request().url()).toContain('/openai/v1/chat/completions');calls.push(route.request().postDataJSON());
    return route.fulfill({json:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:50}}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Improve reason',exact:true}).click();
  await expect(page.locator('#provider')).toHaveValue('aipipe');await expect(page.locator('#endpoint')).toHaveCount(0);
  await page.locator('#api-key').fill('aipipe-test-token');
  await page.getByRole('button',{name:'Check token and load models',exact:true}).click();
  await expect(page.locator('#available-model')).toBeVisible();expect(modelRequests).toBe(1);expect(usageRequests).toBe(1);expect(calls).toHaveLength(0);
  await page.locator('#llm-consent').check();await page.getByRole('button',{name:'Review prediction and improve reason',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your AI-assisted draft',exact:true})).toBeVisible();
  expect(calls).toHaveLength(2);expect(calls[0].model).toBe('gpt-5.6-terra');expect(calls[0].reasoning_effort).toBe('low');expect(calls[0].max_completion_tokens).toBe(4096);expect(modelRequests).toBe(2);
  await page.locator('#provider').selectOption('compatible');await expect(page.locator('#api-key')).toHaveValue('');await expect(page.locator('#llm-consent')).not.toBeChecked();
});
test('an imported archive cannot unlock account submission on refresh',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Advanced data',exact:true}).click();
  await page.getByText('Import a previously downloaded evidence file (advanced)',{exact:true}).click();
  await page.locator('#archive-import').setInputFiles({name:'forecast-evidence.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(archive))});
  await page.getByRole('button',{name:'My prediction',exact:true}).click();await page.getByRole('button',{name:'Refresh prediction',exact:true}).click();
  await page.getByRole('button',{name:'Save to game',exact:true}).click();await page.locator('#launch-token').fill('fresh');await page.getByRole('button',{name:'Connect account',exact:true}).click();
  await expect(page.locator('.identity')).toHaveText('student@example.test');await expect(page.getByRole('button',{name:'Review zero-credit save',exact:true})).toBeDisabled();
});
