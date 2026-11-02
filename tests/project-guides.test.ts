import {describe,it,expect} from 'vitest';
import {EXAMPLE_OFFER,P1_EXAM_CLOSE,PROJECT_QUESTIONS,offerScript,phaseStatus,scriptTiming} from '../src/projectQuestions';

describe('Project 1 published phases',()=>{
  it('retains seven questions with separate creator and reader phases',()=>{
    expect(PROJECT_QUESTIONS.map(q=>q.number)).toEqual([1,2,3,4,5,6,7]);
    expect(PROJECT_QUESTIONS.find(q=>q.id==='q7')!.phases.map(p=>p.label)).toEqual(['Create','Narrate and rank','Final receipt']);
  });
  it('marks Q2 open and the drawing/reader activities closed on November 2',()=>{
    const now=Date.parse('2026-11-02T10:00:00+05:30');
    expect(phaseStatus(PROJECT_QUESTIONS[1].phases[0],now)).toBe('open');
    expect(phaseStatus(PROJECT_QUESTIONS[2].phases[0],now)).toBe('closed');
    expect(phaseStatus(PROJECT_QUESTIONS[6].phases[0],now)).toBe('closed');
    expect(phaseStatus(PROJECT_QUESTIONS[6].phases[1],now)).toBe('closed');
  });
  it('uses precise inclusive-open/exclusive-close timestamps without extending activity to the exam deadline',()=>{
    const phase=PROJECT_QUESTIONS[1].phases[0];
    expect(phaseStatus(phase,Date.parse(phase.opensAt!)-1)).toBe('upcoming');
    expect(phaseStatus(phase,Date.parse(phase.opensAt!))).toBe('open');
    expect(phaseStatus(phase,Date.parse(phase.closesAt!))).toBe('closed');
    expect(Date.parse(phase.closesAt!)).toBeLessThan(Date.parse(P1_EXAM_CLOSE));
  });
  it('does not invent a precise midnight cutoff or later classifier release',()=>{
    for(const phase of PROJECT_QUESTIONS[5].phases)expect(phaseStatus(phase,Date.parse('2026-11-02T10:00:00Z'))).toBe('check-game');
    expect(phaseStatus(PROJECT_QUESTIONS[4].phases[1],Date.parse('2026-11-02T10:00:00Z'))).toBe('check-game');
  });
  it('separates regular marks from bonuses and acknowledgements',()=>{
    expect(PROJECT_QUESTIONS[3].score).toContain('0 regular marks');
    expect(PROJECT_QUESTIONS[4].score).toContain('0 regular marks');
    expect(PROJECT_QUESTIONS[5].score).toContain('awarded separately');
    expect(PROJECT_QUESTIONS[6].score).toBe('10 regular marks · 5 creator + 5 reader');
  });
});
describe('local offer script',()=>{
  it('includes each concrete promise and estimates speaking time transparently',()=>{
    const script=offerScript(EXAMPLE_OFFER);
    for(const value of Object.values(EXAMPLE_OFFER))expect(script).toContain(value);
    const timing=scriptTiming(script);
    expect(timing.words).toBeGreaterThan(30);
    expect(timing.quickerSeconds).toBeLessThanOrEqual(timing.slowerSeconds);
    expect(timing.slowerSeconds).toBeLessThanOrEqual(60);
  });
  it('rejects an empty or excessively long promise instead of inventing one',()=>{
    expect(()=>offerScript({...EXAMPLE_OFFER,deliverable:' '})).toThrow(/Fill every field/);
    expect(()=>offerScript({...EXAMPLE_OFFER,service:'x'.repeat(161)})).toThrow();
  });
  it('normalizes whitespace without hiding the student’s content',()=>{
    const script=offerScript({...EXAMPLE_OFFER,service:'  review\n a   chart  '});
    expect(script).toContain('I offer to review a chart.');
    expect(scriptTiming('').words).toBe(0);
  });
});
