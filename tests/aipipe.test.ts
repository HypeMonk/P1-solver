import {afterEach,describe,expect,it,vi} from 'vitest';
import {AIPIPE_BASE,AIPIPE_DEFAULT_MODEL,AIPIPE_FALLBACK_MODEL,MODEL_CATALOG_URL,loadAiPipeModels,checkAiPipeAccount,chatPayload,providerUrl,settingsFor,reviewForecast} from '../src/llm';
import {fixtureArchive,fixtureMarket} from './fixture';
import {forecast} from '../src/forecast';
const account={email:'student@example.test',limit:'1',cost:'0.02'};
const models={data:[{id:AIPIPE_DEFAULT_MODEL},{id:AIPIPE_FALLBACK_MODEL},{id:'gpt-4.1-mini'}]};
const good={verdict:'uncertain',suggestedOutcome:'5000-10000c',explanation:'I choose this range using completed daily reports while future spending remains uncertain.',concerns:['Short history'],evidenceDates:['2026-10-26'],changeTrigger:'New completed reports change my view.'};
const reply=(content=JSON.stringify(good))=>({model:AIPIPE_DEFAULT_MODEL,usage:{prompt_tokens:100,completion_tokens:40},choices:[{finish_reason:'stop',message:{content}}]});
const f=forecast(fixtureArchive,fixtureMarket,Date.parse('2026-10-27T14:00:00Z'));

describe('AI Pipe matches the old solver route',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('defaults to OpenAI with a plain model ID, not an OpenRouter catalog ID',()=>{
    const s=settingsFor('aipipe');expect(s.model).toBe(AIPIPE_DEFAULT_MODEL);expect(s.aipipeRoute).toBe('openai');expect(s.fallback).toBe(false);expect(providerUrl(s)).toBe('https://aipipe.org/openai/v1');
    expect(providerUrl({...s,aipipeRoute:'openrouter'})).toBe('https://aipipe.org/openrouter/v1');
  });
  it('clears credentials in a new provider preset',()=>expect(settingsFor('compatible')).toMatchObject({key:'',model:'',fallback:false}));
  it('requires a token for the actual OpenAI list',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(loadAiPipeModels()).rejects.toThrow(/token/);expect(fetch).not.toHaveBeenCalled();});
  it('requests the route-specific model list with Bearer auth and no cookies',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(models)));vi.stubGlobal('fetch',fetch);const result=await loadAiPipeModels('api-token');expect(result.map(m=>m.id)).toContain(AIPIPE_DEFAULT_MODEL);
    expect(fetch).toHaveBeenCalledWith(`${AIPIPE_BASE}/models`,expect.objectContaining({headers:{Authorization:'Bearer api-token'},credentials:'omit'}));
  });
  it('only uses the public catalog when the OpenRouter route is selected',async()=>{const fetch=vi.fn(async()=>new Response(JSON.stringify({data:[{id:'vendor/model'}]})));vi.stubGlobal('fetch',fetch);await loadAiPipeModels('api-token','openrouter');expect(fetch).toHaveBeenCalledWith(MODEL_CATALOG_URL,expect.not.objectContaining({headers:expect.anything()}));});
  it('checks allowance without a completion',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify(account)));vi.stubGlobal('fetch',fetch);const a=await checkAiPipeAccount('api-token');expect(a.remaining).toBeCloseTo(.98);expect(fetch).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledWith('https://aipipe.org/usage',expect.objectContaining({headers:{Authorization:'Bearer api-token'}}));
  });
  it('stops on exhausted allowance',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...account,cost:1}))));await expect(checkAiPipeAccount('api-token')).rejects.toThrow(/exhausted/);});
  it('keeps unknown balance unknown',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({email:account.email}))));expect((await checkAiPipeAccount('api-token')).remaining).toBeNull();});
  it('uses reasoning-model parameters from the old solver',()=>{const body=chatPayload(settingsFor('aipipe'),AIPIPE_DEFAULT_MODEL,{task:'review'});expect(body).toMatchObject({model:AIPIPE_DEFAULT_MODEL,max_completion_tokens:4096,reasoning_effort:'low',response_format:{type:'json_object'}});expect(body).not.toHaveProperty('max_tokens');expect(body).not.toHaveProperty('temperature');});
  it('uses ordinary token limits for non-reasoning models',()=>{const body=chatPayload(settingsFor('aipipe'),'gpt-4.1-mini',{});expect(body).toHaveProperty('max_tokens',2400);expect(body).not.toHaveProperty('reasoning_effort');});
  it('does not leak remote error bodies',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{message:'remote-secret',code:'model_not_found'}}),{status:404})));await expect(loadAiPipeModels('test')).rejects.toThrow(/HTTP 404/);});
  it('does not infer availability from an empty catalog',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({data:[]}))));await expect(loadAiPipeModels('test')).rejects.toThrow(/No models/);});
  it('runs two passes after validation, without auto retry by default',async()=>{
    const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
      if(url.endsWith('/usage'))return new Response(JSON.stringify(account));if(url.endsWith('/models'))return new Response(JSON.stringify(models));calls.push(JSON.parse(init.body as string));return new Response(JSON.stringify(reply()));
    }));
    const review=await reviewForecast({...settingsFor('aipipe'),key:'api-token'},f,fixtureArchive,fixtureMarket,'I worry usage may grow.',()=>{},new AbortController().signal);
    expect(calls).toHaveLength(2);expect(review.attempts).toBe(2);expect(review.usage.input).toBe(200);expect(calls[0].messages[1].content).not.toContain('"recommendation"');expect(calls[1].messages[1].content).toContain('"recommendation"');
  });
  it('does not pay for a model absent from the selected route',async()=>{
    const fetch=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/usage')?account:models)));vi.stubGlobal('fetch',fetch);
    await expect(reviewForecast({...settingsFor('aipipe'),key:'token',model:'invented-model'},f,fixtureArchive,fixtureMarket,'',()=>{},new AbortController().signal)).rejects.toThrow(/not in/);expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('permitted fallback is bounded and uses the listed backup',async()=>{
    const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
      if(url.endsWith('/usage'))return new Response(JSON.stringify(account));if(url.endsWith('/models'))return new Response(JSON.stringify(models));const body=JSON.parse(init.body as string);calls.push(body);
      return new Response(JSON.stringify(reply(body.model===AIPIPE_DEFAULT_MODEL?'invalid JSON':JSON.stringify(good))));
    }));
    const r=await reviewForecast({...settingsFor('aipipe'),key:'token',fallback:true},f,fixtureArchive,fixtureMarket,'',()=>{},new AbortController().signal);
    expect(calls.map(c=>c.model)).toEqual([AIPIPE_DEFAULT_MODEL,AIPIPE_FALLBACK_MODEL,AIPIPE_DEFAULT_MODEL,AIPIPE_FALLBACK_MODEL]);expect(r.attempts).toBe(4);
  });
  it('quota rejection never spends a backup even when approved',async()=>{
    let completions=0;vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
      if(url.endsWith('/usage'))return new Response(JSON.stringify(account));if(url.endsWith('/models'))return new Response(JSON.stringify(models));completions++;return new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status:429});
    }));
    await expect(reviewForecast({...settingsFor('aipipe'),key:'token',fallback:true},f,fixtureArchive,fixtureMarket,'',()=>{},new AbortController().signal)).rejects.toThrow(/exhausted/);expect(completions).toBe(1);
  });
});
