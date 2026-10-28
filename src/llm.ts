import { z } from 'zod';
import type { Archive, Market } from './core';
import { validateReason } from './core';
import { type Forecast, evidenceForReview } from './forecast';
import { REVIEW_SYSTEM, INDEPENDENT_TASK, CRITIC_TASK } from './reviewPrompts';

export type Provider = 'aipipe'|'anthropic'|'compatible';
export type AiPipeRoute = 'openai'|'openrouter';
export interface LlmSettings { provider:Provider; key:string; model:string; endpoint:string; fallback:boolean; aipipeRoute?:AiPipeRoute }
export const AIPIPE_BASE = 'https://aipipe.org/openai/v1';
export const MODEL_CATALOG_URL = 'https://openrouter.ai/api/v1/models';
export const AIPIPE_DEFAULT_MODEL = 'gpt-5.6-terra';
export const AIPIPE_FALLBACK_MODEL = 'gpt-5.4-mini';
export function settingsFor(provider:Provider):LlmSettings {
  return { provider, key:'', model:provider==='aipipe'?AIPIPE_DEFAULT_MODEL:provider==='anthropic'?'claude-opus-5-5':'', endpoint:'', fallback:provider==='anthropic', ...(provider==='aipipe'?{aipipeRoute:'openai' as const}:{}) };
}
export interface ProviderModel { id:string; name:string }
export interface AiPipeAccount { email:string; limit:number|null; spent:number|null; remaining:number|null; checkedAt:string }
export class LlmError extends Error {
  constructor(message:string,public code:string,public status=0){super(message);}
}
export function providerUrl(settings:LlmSettings) {
  if(settings.provider==='aipipe')return settings.aipipeRoute==='openrouter'?'https://aipipe.org/openrouter/v1':AIPIPE_BASE;
  if(settings.provider==='anthropic')return 'https://api.anthropic.com';
  const url=new URL(settings.endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Use an HTTPS provider base URL without credentials, query parameters, or fragments.');
  return url.toString().replace(/\/$/,'');
}
async function providerJson(url:string,init:RequestInit,signal?:AbortSignal):Promise<any>{
  const response=await fetch(url,{...init,signal:signal??AbortSignal.timeout(25_000),credentials:'omit',referrerPolicy:'no-referrer'});
  const text=await response.text();
  if(text.length>2_000_000)throw new LlmError('The provider response was too large.','invalid_response',response.status);
  let data:any;try{data=JSON.parse(text);}catch{data=null;}
  if(!response.ok){
    const error=data?.error;
    const code=typeof error==='object'?String(error?.code??''):'';
    const quota=code==='insufficient_quota'||(response.status===429&&typeof error==='string'&&/exceed|limit|budget/i.test(error));
    if([401,403].includes(response.status))throw new LlmError('The provider rejected this token. For AI Pipe, copy the API token from aipipe.org/login, not the game entry token.','invalid_key',response.status);
    if(response.status===402||quota)throw new LlmError('Your provider allowance is exhausted. Check your balance or use the free factual explanation.','quota',response.status);
    if(response.status===429)throw new LlmError('The provider rate-limited this request. Try again later.','rate_limit',response.status);
    const modelError=['model_not_found','invalid_model','no_available_provider'].includes(code)||[404,503].includes(response.status);
    throw new LlmError(`The provider returned HTTP ${response.status}. ${modelError?'This model may be unavailable; check the route and model list.':'Check the selected model and provider settings.'}`,modelError?'model_unavailable':'provider_error',response.status);
  }
  if(!data||typeof data!=='object'||Array.isArray(data))throw new LlmError('The provider did not return a JSON object.','invalid_response');
  return data;
}
const finiteAmount=(value:unknown):number|null=>{
  if((typeof value!=='number'&&typeof value!=='string')||value==='')return null;
  const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
};
export async function checkAiPipeAccount(key:string,signal?:AbortSignal):Promise<AiPipeAccount>{
  if(!key.trim())throw new Error('Paste your AI Pipe API token first.');
  const data=await providerJson('https://aipipe.org/usage',{headers:{Authorization:`Bearer ${key.trim()}`}},signal);
  if(typeof data.email!=='string'||!data.email.includes('@'))throw new LlmError('AI Pipe did not return a student account. Use an AI Pipe API token, not a direct provider key.','invalid_key');
  const limit=finiteAmount(data.limit),spent=finiteAmount(data.cost);
  if(limit!==null&&spent!==null&&spent>=limit)throw new LlmError('Your AI Pipe allowance is exhausted. Use the free explanation or wait for the allowance to renew.','quota');
  return {email:data.email,limit,spent,remaining:limit!==null&&spent!==null?limit-spent:null,checkedAt:new Date().toISOString()};
}
export async function loadAiPipeModels(key='',route:AiPipeRoute='openai',signal?:AbortSignal):Promise<ProviderModel[]>{
  if(route==='openai'&&!key.trim())throw new Error('Paste your AI Pipe token to load the OpenAI models returned for that route.');
  const url=route==='openai'?`${AIPIPE_BASE}/models`:MODEL_CATALOG_URL;
  const data=await providerJson(url,route==='openai'?{headers:{Authorization:`Bearer ${key.trim()}`}}:{},signal);
  const parsed=z.object({data:z.array(z.object({id:z.string().min(1).max(200),name:z.string().max(300).optional()})).max(5000)}).parse(data).data;
  if(!parsed.length)throw new LlmError('No models were returned for this route.','model_unavailable');
  return [...new Map(parsed.map(m=>[m.id,{id:m.id,name:m.name??m.id}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
}
const ReviewSchema=z.object({
  verdict:z.enum(['supports','uncertain','disagrees']),suggestedOutcome:z.string().max(100),
  explanation:z.string().min(15).max(1000),concerns:z.array(z.string().max(500)).max(6),
  evidenceDates:z.array(z.string()).max(30),changeTrigger:z.string().max(500),
});
export type Review=z.infer<typeof ReviewSchema>;
export interface ReviewPair { independent:Review; critic:Review; model:string; createdAt:string; evidenceId:string; usage:{ input:number; output:number }; modelsUsed?:string[]; attempts?:number }
export function parseReview(text:string,archive:Archive,market:Market):Review{
  const cleaned=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  const result=ReviewSchema.parse(JSON.parse(cleaned));validateReason(result.explanation);
  if(!market.outcomes.some(o=>o.id===result.suggestedOutcome))throw new Error('The model proposed a range that does not exist. Its response was rejected.');
  const known=new Set(archive.days.filter(d=>d.complete&&d.available&&d.spend!==null).map(d=>d.date));
  if(!result.evidenceDates.length||result.evidenceDates.some(d=>!known.has(d)))throw new Error('The model cited unavailable observations. Its response was rejected.');
  return result;
}
export function chatPayload(settings:LlmSettings,model:string,payload:unknown){
  const reasoning=settings.provider==='aipipe'&&settings.aipipeRoute!=='openrouter'&&model.startsWith('gpt-5');
  return {model,messages:[{role:'system',content:REVIEW_SYSTEM},{role:'user',content:JSON.stringify(payload)}],
    ...(reasoning?{max_completion_tokens:4096,reasoning_effort:'low'}:{max_tokens:2400}),
    ...(settings.provider==='aipipe'?{response_format:{type:'json_object'}}:{}),
  };
}
export async function reviewForecast(settings:LlmSettings,f:Forecast,archive:Archive,market:Market,notes:string,onProgress:(message:string)=>void,signal:AbortSignal):Promise<ReviewPair>{
  if(!settings.key.trim()||!settings.model.trim())throw new Error('Enter your provider API key and model ID.');
  if(!f.recommendation||f.stale)throw new Error('Refresh valid, current evidence before asking for a paid review.');
  if(notes.length>1500)throw new Error('Keep your optional context under 1,500 characters.');
  const endpoint=providerUrl(settings);const usage={input:0,output:0};const modelsUsed:string[]=[];let attempts=0;
  let fallbackAllowed=false;
  if(settings.provider==='aipipe'){
    onProgress('Checking your AI Pipe account and model list. No AI text is generated by these checks.');
    await checkAiPipeAccount(settings.key,signal);
    const models=await loadAiPipeModels(settings.key,settings.aipipeRoute??'openai',signal);
    if(!models.some(m=>m.id===settings.model.trim()))throw new LlmError('The selected model is not in the returned list for this route. Load the model list and choose one before reviewing.','model_unavailable');
    fallbackAllowed=settings.fallback&&settings.aipipeRoute!=='openrouter'&&settings.model!==AIPIPE_FALLBACK_MODEL&&models.some(m=>m.id===AIPIPE_FALLBACK_MODEL);
  }
  async function call(payload:unknown,model:string):Promise<string>{
    attempts++;
    if(settings.provider==='anthropic'){
      const {default:Anthropic}=await import('@anthropic-ai/sdk');
      const client=new Anthropic({apiKey:settings.key.trim(),dangerouslyAllowBrowser:true,maxRetries:0,timeout:180_000});
      const stream=client.beta.messages.stream({model,max_tokens:4096,thinking:{type:'adaptive'},output_config:{effort:'low'},
        ...(settings.fallback?{betas:['server-side-fallback-2026-07-01'],fallbacks:'default' as const}:{}),
        system:REVIEW_SYSTEM,messages:[{role:'user',content:JSON.stringify(payload)}]},{signal});
      const message=await stream.finalMessage();
      usage.input+=message.usage.input_tokens;usage.output+=message.usage.output_tokens;
      if(message.stop_reason!=='end_turn')throw new LlmError(`The model did not finish a usable review (${message.stop_reason}). No draft was applied.`,'invalid_response');
      modelsUsed.push(message.model);
      return message.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    }
    const data=await providerJson(`${endpoint}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.key.trim()}`},body:JSON.stringify(chatPayload(settings,model,payload))},signal);
    usage.input+=finiteAmount(data.usage?.prompt_tokens)??0;usage.output+=finiteAmount(data.usage?.completion_tokens)??0;
    if(data.choices?.[0]?.finish_reason!=='stop'||data.choices?.[0]?.message?.refusal||typeof data.choices?.[0]?.message?.content!=='string')throw new LlmError('The provider returned an incomplete or unsupported response.','invalid_response');
    modelsUsed.push(typeof data.model==='string'?data.model:model);
    return data.choices[0].message.content;
  }
  async function pass(payload:unknown):Promise<Review>{
    try{return parseReview(await call(payload,settings.model.trim()),archive,market);}
    catch(e){
      if(signal.aborted||!fallbackAllowed||e instanceof TypeError||(e instanceof LlmError&&!['model_unavailable','invalid_response'].includes(e.code)))throw e;
      onProgress('The selected model did not return a usable review. Trying the pre-approved backup once.');
      return parseReview(await call(payload,AIPIPE_FALLBACK_MODEL),archive,market);
    }
  }
  const evidence=evidenceForReview(f,archive,market);
  onProgress('Review 1 of 2: forming a separate opinion from the observations…');
  const independent=await pass({task:INDEPENDENT_TASK,market:evidence.market,observations:evidence.observations,limitations:evidence.limitations,studentContext:notes});
  onProgress('Review 2 of 2: checking disagreements, reasoning, and the explanation…');
  const critic=await pass({task:CRITIC_TASK,evidence,firstReview:independent,studentContext:notes});
  return {independent,critic,model:settings.model.trim(),createdAt:new Date().toISOString(),evidenceId:f.evidenceId,usage,modelsUsed,attempts};
}
