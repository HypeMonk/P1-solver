import {describe,it,expect} from 'vitest';
import {personalHistory,crowdPrediction} from '../src/gameHistory';
import {fixtureMarket as market} from './fixture';
const student='student@example.test';
const probabilities=market.outcomes.map(o=>o.id==='5000-10000c'?1:0);
const own={entryId:'own-1',at:'2026-10-27T10:00:00Z',reason:'I used recent reports.',probabilities};
describe('readable personal market history',()=>{
  it('merges private forecasts with feed metadata without duplication',()=>{
    const result=personalHistory({view:{},history:{feed:[{...own,reason:'Old reason',own:true}]},portfolio:{forecasts:[own],journal:[]}},student,market);
    expect(result.predictions).toHaveLength(1);expect(result.predictions[0]).toMatchObject({at:own.at,reason:own.reason,choice:'$50 to under $100'});
  });
  it('does not count observation or settlement updates as saved predictions',()=>{
    const fact={entryId:'fact',type:'observation',own:true,value:0};
    const result=personalHistory({view:{},portfolio:{forecasts:[fact],journal:[]},history:{feed:[fact,{type:'settlement',own:true,outcomeId:'5000-10000c'}]}},student,market);
    expect(result.predictions).toHaveLength(0);expect(result.recognized).toBe(true);
  });
  it('excludes other students from the personal table',()=>{
    const result=personalHistory({view:{},portfolio:{forecasts:[own]},history:{feed:[{...own,entryId:'someone-else',actor:'other@example.test',reason:'Other student'}]}},student,market);
    expect(result.predictions).toHaveLength(1);expect(result.predictions[0].reason).toBe(own.reason);
  });
  it('recognizes an explicitly own event and sorts newest first',()=>{
    const result=personalHistory({view:{},portfolio:{},history:{events:[{...own,actor:student},{...own,entryId:'new',own:true,at:'2026-10-27T11:00:00Z'}]}},student,market);
    expect(result.predictions.map(r=>r.id)).toEqual(['id:new','id:own-1']);
  });
  it('falls back to events if a feed is empty',()=>{
    expect(personalHistory({view:{},portfolio:{},history:{feed:[],events:[{...own,own:true}]}},student,market).predictions).toHaveLength(1);
  });
  it('distinguishes an unknown response shape from an empty personal list',()=>{
    expect(personalHistory({view:{},portfolio:{verified:true},history:{unrecognized:[]}},student,market).recognized).toBe(false);
  });
  it('keeps mixed probability forecasts distinct from a one-hot choice',()=>{
    const p=probabilities.map(()=>0);p[11]=.4;p[12]=.6;
    expect(personalHistory({view:{},portfolio:{forecasts:[{...own,probabilities:p}]},history:{}},student,market).predictions[0].choice).toContain('60.0%');
  });
  it('does not invent a timestamp',()=>{
    expect(personalHistory({view:{},portfolio:{forecasts:[{...own,at:'not a time'}]},history:{}},student,market).predictions[0].at).toBeNull();
  });
  it('reports crowd market weights without assuming a student count',()=>{
    const p=probabilities.map(()=>0);p[11]=.30;p[12]=.28;p[13]=.37;p[10]=.05;
    expect(crowdPrediction({view:{probabilities:p},portfolio:{},history:{}},market)).toEqual({label:'$100 to under $200',share:.37});
  });
  it('does not claim a crowd favorite from a uniform starting market',()=>{
    expect(crowdPrediction({view:{probabilities:probabilities.map(()=>1/17)},portfolio:{},history:{}},market)).toBeNull();
  });
});
