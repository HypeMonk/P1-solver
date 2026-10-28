import { test,expect } from '@playwright/test';
import { fixtureArchive as archive, fixtureMarket as market } from '../fixture';
test('the bundled Anthropic SDK streams two mocked reviews without exposing course data',async({page})=>{
  await page.clock.install({time:new Date('2026-10-27T14:00:00Z')});
  await page.route('**/data/archive.json',route=>route.fulfill({json:archive}));
  await page.route('**/data/market.json',route=>route.fulfill({json:market}));
  await page.route('**/api/data*',route=>route.fulfill({json:{archive}}));
  await page.route('https://tds-network-games.sanand.workers.dev/prediction-market/api/markets',route=>route.fulfill({json:{markets:[market]}}));
  const calls:any[]=[];
  await page.route('https://api.anthropic.com/**',async route=>{
    const data=route.request().postDataJSON();calls.push(data);
    const text=JSON.stringify({verdict:'uncertain',suggestedOutcome:'5000-10000c',explanation:'I would choose this range using the completed reports, while keeping the limited history in mind.',concerns:['Sparse history'],evidenceDates:['2026-10-26'],changeTrigger:'New completed-day spending shifts the forecast.'});
    const events=[
      {type:'message_start',message:{id:'msg_test',type:'message',role:'assistant',model:'claude-opus-5-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:100,output_tokens:0}}},
      {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
      {type:'content_block_delta',index:0,delta:{type:'text_delta',text}},
      {type:'content_block_stop',index:0},
      {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:50}},
      {type:'message_stop'},
    ];
    await route.fulfill({contentType:'text/event-stream',body:events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')});
  });
  await page.goto('/');await page.getByRole('button',{name:'Improve reason',exact:true}).click();
  await page.locator('#provider').selectOption('anthropic');
  await page.locator('#api-key').fill('mock-key-not-a-credential');await page.locator('#llm-consent').check();
  await page.getByRole('button',{name:'Review prediction and improve reason',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your AI-assisted draft',exact:true})).toBeVisible({timeout:20_000});
  expect(calls).toHaveLength(2);expect(calls[0].stream).toBe(true);expect(calls[0].fallbacks).toBe('default');expect(calls[0].model).toBe('claude-opus-5-5');expect(JSON.stringify(calls)).not.toContain('launch_token');
});
