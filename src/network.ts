import { type Archive, type Market, FEED_URL, MARKET_API, MARKET_ID, parseFeed, validateArchive, validateMarket, validateReason, mergeArchives } from './core';

export class NetworkError extends Error {
  constructor(message: string, public status = 0, public code = '') { super(message); }
}
export async function readJson(url: string, init: RequestInit = {}, timeout = 25_000): Promise<any> {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeout), credentials:'omit', referrerPolicy:'no-referrer' });
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error('Response was too large');
  let data: any;
  try { data = JSON.parse(text); } catch { throw new NetworkError('The service did not return JSON. It may be starting up; try again.',response.status); }
  if (!response.ok) throw new NetworkError(typeof data.message === 'string' ? data.message.slice(0,300) : `Service returned HTTP ${response.status}.`,response.status,String(data.error ?? ''));
  return data;
}
export const PUBLIC_FEED_RELAY = `https://aipipe.org/proxy/${FEED_URL}`;
export async function loadData(previous?: Archive | null, forceRefresh=false): Promise<{ archive:Archive; market:Market; notices:string[]; configLive:boolean; liveFeedChecked:boolean }> {
  const base = import.meta.env.BASE_URL;
  const notices: string[] = [];
  const [stored, config] = await Promise.all([
    readJson(`${base}data/archive.json`, { cache:'no-store' }),
    readJson(`${base}data/market.json`, { cache:'no-store' }),
  ]);
  let archive = mergeArchives(previous ?? null,validateArchive(stored));
  let market = validateMarket(config);
  let configLive = false;
  try {
    const catalog = await readJson(`${MARKET_API}/markets`);
    market = validateMarket(catalog.markets?.find((m: any) => m.id === MARKET_ID));
    configLive = true;
  } catch {
    notices.push('The live market rules could not be checked. You can explore the saved forecast, but submissions are disabled.');
  }
  let liveFeedChecked=false;
  if (import.meta.env.VITE_STATIC_ONLY !== 'true') {
    try {
      const api = import.meta.env.VITE_DATA_API || `${base}api/data`;
      const url = forceRefresh ? `${api}${api.includes('?')?'&':'?'}refresh=1` : api;
      const data = await readJson(url, {cache:'no-store'}, 75_000);
      archive = mergeArchives(archive,validateArchive(data.archive));
      liveFeedChecked=typeof data.warning !== 'string';
      if (typeof data.warning === 'string') notices.push(data.warning);
    } catch {
      notices.push('The local feed relay is unavailable. Trying the fixed public feed relay instead.');
    }
  }
  if (!liveFeedChecked) {
    try {
      const response=await fetch(PUBLIC_FEED_RELAY,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25_000)});
      if(!response.ok)throw new Error('Public feed relay unavailable');
      archive=mergeArchives(archive,parseFeed(await response.text()));
      liveFeedChecked=true;
      notices.push('The latest available official spending report was fetched through AI Pipe’s token-free public URL relay. No AI request was made.');
    }catch{
      notices.push('Live source refresh failed. The displayed timestamp belongs to the last available archive, not a newly acquired report.');
    }
  }
  if(import.meta.env.VITE_STATIC_ONLY==='true')notices.push('Static hosting: the scheduled archive retains older days; the browser also attempts a current public-feed read on each refresh.');
  return { archive, market, notices, configLive, liveFeedChecked };
}
export function extractLaunchToken(input: string): string {
  let text = input.trim();
  if (/^https?:\/\//i.test(text)) {
    const url = new URL(text);
    if (url.origin !== 'https://tds-network-games.sanand.workers.dev') throw new Error('Use the personal link from the official Q1 market.');
    text = new URLSearchParams(url.hash.slice(1)).get('launch_token') ?? url.searchParams.get('launch_token') ?? '';
  }
  if (!text || text.length > 16000 || /\s/.test(text)) throw new Error('Paste a fresh entry token or your full personal Q1 market link.');
  return text;
}
export function reflectionPayload(market: Market, outcome: string, reason: string, key: string) {
  if (!market.outcomes.some(o => o.id === outcome)) throw new Error('Choose an outcome in the current market.');
  return { probabilities:market.outcomes.map(o => o.id === outcome ? 1 : 0), reason:validateReason(reason), choicePublic:false, explanationPublic:false, idempotency_key:key };
}
export class MarketClient {
  private token = '';
  studentId = '';
  private pending: { encoded:string; key:string } | null = null;
  private saving = false;
  async request(path:string, init:RequestInit = {}) {
    try { return await readJson(`${MARKET_API}${path}`,{...init, headers:{ 'Content-Type':'application/json', ...(this.token ? { Authorization:`Bearer ${this.token}` } : {}), ...init.headers }}); }
    catch (e) {
      if (e instanceof NetworkError && (e.status===401 || ['invalid_session','verified_identity_required'].includes(e.code))) this.disconnect();
      throw e;
    }
  }
  async connect(input:string) {
    this.disconnect();
    const data = await this.request('/session',{method:'POST',body:JSON.stringify({launch_token:extractLaunchToken(input)})});
    if (typeof data.token !== 'string' || !data.token || typeof data.student_id !== 'string' || !data.student_id || data.student_id.startsWith('practice:')) throw new Error('A verified course session was not returned. Open your personal Q1 link again.');
    this.token=data.token; this.studentId=data.student_id;
    return this.studentId;
  }
  disconnect() { this.token=''; this.studentId=''; this.pending=null; }
  async state() {
    if (!this.token) throw new Error('Connect your course account first.');
    const [view,portfolio,history] = await Promise.all([
      this.request(`/markets/${MARKET_ID}`),this.request(`/markets/${MARKET_ID}/portfolio`),this.request(`/markets/${MARKET_ID}/history`),
    ]);
    validateMarket(view.config);
    if (portfolio.verified === false) throw new Error('This account is not verified for the course.');
    return {view,portfolio,history};
  }
  async save(market:Market,outcome:string,reason:string,now=Date.now()) {
    if (this.saving) throw new Error('A prediction is already being saved.');
    if (!this.token) throw new Error('Your session needs reconnecting.');
    if (now<Date.parse(market.trading.opensAt) || now>=Date.parse(market.trading.closesAt)) throw new Error('Outside the scoring window. No prediction was sent.');
    const encoded=JSON.stringify({ market:market.id,outcome,reason:validateReason(reason) });
    if (this.pending?.encoded!==encoded) this.pending={encoded,key:crypto.randomUUID()};
    this.saving=true;
    try {
      const result=await this.request(`/markets/${MARKET_ID}/reflection`,{method:'POST',body:JSON.stringify(reflectionPayload(market,outcome,reason,this.pending.key))});
      this.pending=null;
      return result;
    } finally { this.saving=false; }
  }
  async receipt() {
    if (!this.token) throw new Error('Connect to retrieve your personal result code.');
    const result=await this.request(`/markets/${MARKET_ID}/receipt`);
    const token=result.receipt ?? result.token;
    if (typeof token !== 'string' || !token) throw new Error('Your signed result is not ready. Check again after official settlement.');
    return { token, score:typeof result.score==='number' ? result.score : null, result:result.result };
  }
}
