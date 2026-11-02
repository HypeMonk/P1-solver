export const Q1_TABS = ['Forecast','Evidence','AI review','My account','Simple guide'] as const;
export type Q1Tab = typeof Q1_TABS[number];
export const Q1_TAB_IDS = ['forecast','evidence','ai-review','my-account','simple-guide'] as const;
export type GuideId = 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7';
export type ProjectRoute = { kind:'home' } | { kind:'q1'; tab:Q1Tab } | { kind:'guide'; questionId:GuideId };
export function projectRoute(hash:string):ProjectRoute {
  const id=hash.replace(/^#/,'');
  if (id==='q1') return {kind:'q1',tab:'Forecast'};
  const index=Q1_TAB_IDS.indexOf(id as typeof Q1_TAB_IDS[number]);
  if (index>=0) return {kind:'q1',tab:Q1_TABS[index]};
  if (/^q[2-7]$/.test(id)) return {kind:'guide',questionId:id as GuideId};
  return {kind:'home'};
}
