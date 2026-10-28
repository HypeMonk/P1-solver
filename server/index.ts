import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { FEED_URL, parseFeed, validateArchive } from '../src/core';
import { createFeedRelay } from './feedRelay';

const app=express();
const root=fileURLToPath(new URL('../',import.meta.url));
const readFeed=createFeedRelay(
  async()=>validateArchive(JSON.parse(await readFile(resolve(root,'public/data/archive.json'),'utf8'))),
  async()=>{
    const response=await fetch(FEED_URL,{signal:AbortSignal.timeout(20_000),cache:'no-store'});
    if(!response.ok)throw new Error('Feed unavailable');
    return parseFeed(await response.text());
  },
);
app.disable('x-powered-by');
app.use((_req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
  next();
});
app.get('/api/health',(_req,res)=>res.json({ok:true,mode:'public-data-relay',storesStudentCredentials:false}));
app.get('/api/data',async (req,res)=>{
  res.set('Cache-Control','no-store');
  try {
    res.json(await readFeed(req.query.refresh==='1'));
  } catch { res.status(503).json({message:'The published data archive is unavailable. Run npm run collect before starting.'}); }
});
app.use('/api',(_req,res)=>res.status(404).json({message:'Only public data endpoints are supported. Never send keys or course tokens to this server.'}));
app.use(express.static(resolve(root,'dist'),{maxAge:'1h',setHeaders(res,path){ if(path.endsWith('.html')||path.endsWith('.json'))res.set('Cache-Control','no-cache'); }}));
app.use((_req,res)=>res.status(404).send('Page not found.'));
const port=Number(process.env.PORT||3000);
app.listen(port,'0.0.0.0',()=>console.log(`Forecast Notebook listening on port ${port}. No credential storage or request-body logging.`));
