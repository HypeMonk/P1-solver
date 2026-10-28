import { type Archive, mergeArchives } from '../src/core';

export function createFeedRelay(loadSeed:()=>Promise<Archive>,fetchReport:()=>Promise<Archive>,now=Date.now){
  let cached:Archive|null=null;
  let refreshed:number|null=null;
  let warning='';
  let inFlight:Promise<void>|null=null;
  let seedLoad:Promise<Archive>|null=null;
  return async(force=false)=>{
    if(!cached){
      seedLoad??=loadSeed().finally(()=>{seedLoad=null;});
      cached=await seedLoad;
    }
    const elapsed=refreshed===null?Infinity:now()-refreshed;
    // A manual refresh may bypass the ten-minute cache, but not hammer the source.
    if(elapsed>=10*60_000||(force&&elapsed>=60_000)){
      if(!inFlight)inFlight=(async()=>{
        try{cached=mergeArchives(cached,await fetchReport());warning='';}
        catch{warning='Official feed refresh failed. This is the last available archive, not a new observation.';}
        finally{refreshed=now();}
      })().finally(()=>{inFlight=null;});
      await inFlight;
    }
    return {archive:cached!,warning:warning||undefined};
  };
}
