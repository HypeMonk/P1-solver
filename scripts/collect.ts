import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { type Archive, FEED_URL, MARKET_API, MARKET_ID, parseFeed, validateArchive, mergeArchives, validateMarket } from '../src/core';

const directory=fileURLToPath(new URL('../public/data/',import.meta.url));
await mkdir(directory,{recursive:true});
let archive:Archive|null=null;
try { archive=validateArchive(JSON.parse(await readFile(resolve(directory,'archive.json'),'utf8'))); }
catch (e:any) { if (e.code!=='ENOENT') throw e; }
const existingArchive=archive;
const bootstrap=process.argv.indexOf('--bootstrap');
if (bootstrap>=0) {
  const source=resolve(process.argv[bootstrap+1]);
  const files=(await readdir(source)).filter(name => /^usage_\d+T\d+\.json$/.test(name)).sort();
  if (!files.length) throw new Error('No timestamped snapshots found. Existing archive was not changed.');
  archive=null;
  for (const name of files) archive=mergeArchives(archive,parseFeed(await readFile(resolve(source,name),'utf8'),Date.now(),`https://github.com/sarangkrish27/aipipe-usage-tracker/blob/main/snapshots/${name}`));
}
async function get(url:string) {
  const response=await fetch(url,{signal:AbortSignal.timeout(30_000)});
  if (!response.ok) throw new Error(`Public source returned HTTP ${response.status}`);
  const text=await response.text();
  if (text.length>5_000_000) throw new Error('Public source too large');
  return text;
}
const [feed,catalogText]=await Promise.all([get(FEED_URL),get(`${MARKET_API}/markets`)]);
archive=mergeArchives(archive,parseFeed(feed));
const catalog=JSON.parse(catalogText);
const market=validateMarket(catalog.markets?.find((m:any)=>m.id===MARKET_ID));
validateArchive(archive);
if (existingArchive && JSON.stringify({...archive,collectedAt:existingArchive.collectedAt}) === JSON.stringify(existingArchive)) archive=existingArchive;
await writeFile(resolve(directory,'archive.json'),JSON.stringify(archive,null,2)+'\n');
await writeFile(resolve(directory,'market.json'),JSON.stringify(market,null,2)+'\n');
console.log(`Public report ${archive.publishedAt}: ${archive.days.length} retained days, ${archive.revisions.length} recorded completed-day revisions. No account data collected.`);
