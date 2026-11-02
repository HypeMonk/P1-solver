import {describe,it,expect} from 'vitest';
import {projectRoute} from '../src/projectRouting';

describe('project homepage and separate question routes',()=>{
  it('opens the question homepage by default and for unknown or obsolete routes',()=>{
    for(const hash of ['', '#home','#unknown','#project-guides'])expect(projectRoute(hash)).toEqual({kind:'home'});
  });
  it('preserves all existing Q1 section links and the short Q1 alias',()=>{
    expect(projectRoute('#q1')).toEqual({kind:'q1',tab:'Forecast'});
    for(const [hash,tab]of [['forecast','Forecast'],['evidence','Evidence'],['ai-review','AI review'],['my-account','My account'],['simple-guide','Simple guide']])expect(projectRoute('#'+hash)).toEqual({kind:'q1',tab});
  });
  it('opens each other question without a shared question-picker tab',()=>{
    for(const questionId of ['q2','q3','q4','q5','q6','q7'])expect(projectRoute('#'+questionId)).toEqual({kind:'guide',questionId});
  });
});
