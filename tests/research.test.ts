import {describe,it,expect} from 'vitest';
import {buildResearchPacket,sharedResearchData} from '../src/researchPacket';
import {fixtureArchive,fixtureMarket} from './fixture';
const own='owner@example.test';
const p=fixtureMarket.outcomes.map(o=>o.id==='10000-20000c'?1:0);
const input={archive:fixtureArchive,market:fixtureMarket,game:null,gameFetchedAt:null,studentId:own,rulesLive:true,notices:[],imported:false,now:Date.parse('2026-10-27T14:00:00Z')};
const getData=(text:string)=>JSON.parse(text.split('BEGIN RESEARCH DATA\n')[1].split('\nEND RESEARCH DATA')[0]);
describe('external LLM research packet',()=>{
  it('contains current observations, calculation source, ranges, prompts and provenance',async()=>{
    const text=await buildResearchPacket(input),d=getData(text);expect(d.archive.days).toHaveLength(fixtureArchive.days.length);expect(d.market.settlement.numericRanges).toHaveLength(17);expect(d.methods.simulations.count).toBe(6000);expect(d.sourceCode.forecast.text).toContain('export function forecast');expect(d.sourceCode.validation.text).toContain('precision: 120');expect(d.sourceCode.forecast.sha256).toHaveLength(64);expect(d.promptTemplates.reviewSystem).toContain('reviewer');expect(d.sharedMarketEvidence.available).toBe(false);expect(text).not.toContain(own);
  });
  it('marks stale snapshots and analysis imports instead of claiming always-live data',async()=>{const text=await buildResearchPacket({...input,now:Date.parse('2026-10-29T14:00:00Z'),imported:true});expect(text).toContain('WARNING: source report is stale');expect(text).toContain('WARNING: this includes an analysis import');expect(getData(text).freshness.stale).toBe(true);});
  it('recomputes outputs at download time rather than trusting an old forecast object',async()=>{const newer=structuredClone(fixtureArchive);newer.days.filter(d=>d.complete).forEach(d=>d.spend='150');const old=getData(await buildResearchPacket(input)),changed=getData(await buildResearchPacket({...input,archive:newer}));expect(changed.forecast.point).not.toBe(old.forecast.point);expect(changed.forecast.evidenceId).not.toBe(old.forecast.evidenceId);});
  it('only exports explicitly public peer fields without identities',()=>{
    const state={view:{probabilities:p},portfolio:{forecasts:[{entryId:'mine'}]},history:{feed:[
      {entryId:'mine',choicePublic:true,explanationPublic:true,probabilities:p,reason:'Private own reason'},
      {entryId:'hidden',probabilities:p,reason:'Secret peer reason',actor:'hidden@example.test'},
      {entryId:'choice',choicePublic:true,explanationPublic:false,probabilities:p,reason:'Do not include this'},
      {entryId:'shared',choicePublic:false,explanationPublic:true,probabilities:p,reason:'Public reason',actor:'peer@example.test'},
    ]}};
    const output=sharedResearchData(state,fixtureMarket,own);expect(output.entries).toHaveLength(2);expect(output.entries[0].choice).not.toBeNull();expect(output.entries[0].reason).toBeNull();expect(output.entries[1].choice).toBeNull();expect(output.entries[1].reason).toBe('Public reason');const json=JSON.stringify(output);expect(json).not.toContain('Secret peer');expect(json).not.toContain('@');expect(json).not.toContain('Private own');expect(json).not.toContain('Do not include');
  });
  it('redacts credentials and emails in untrusted shared explanations',()=>{
    const s={view:{},portfolio:{},history:{feed:[{explanationPublic:true,reason:'email peer@example.test; Bearer token-secret; sk-fake-private-key; custom-secret-123'}]}};
    const json=JSON.stringify(sharedResearchData(s,fixtureMarket,own,['custom-secret-123']));expect(json).not.toContain('peer@example.test');expect(json).not.toContain('token-secret');expect(json).not.toContain('sk-fake');expect(json).not.toContain('custom-secret-123');
  });
  it('stops if a known secret is embedded outside share text',async()=>{const a=structuredClone(fixtureArchive);a.sources.push('https://example.test/private-secret-123');await expect(buildResearchPacket({...input,archive:a,secrets:['private-secret-123']})).rejects.toThrow(/sensitive value/);});
  it('does not pass through arbitrary provider/session fields from the game response',async()=>{
    const text=await buildResearchPacket({...input,game:{view:{token:'session-secret-123'},portfolio:{api_key:'private-api-key',forecasts:[]},history:{receipt:'signed-receipt-secret',feed:[]}},gameFetchedAt:'2026-10-27T14:00:00Z'});expect(text).not.toContain('session-secret-123');expect(text).not.toContain('private-api-key');expect(text).not.toContain('signed-receipt-secret');
  });
});
