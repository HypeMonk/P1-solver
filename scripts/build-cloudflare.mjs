import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.npm_execpath)throw new Error('Run this through npm run build:cloudflare.');
const result=spawnSync(process.execPath,[process.env.npm_execpath,'run','build'],{
  cwd:root,stdio:'inherit',env:{...process.env,VITE_STATIC_ONLY:'true',BASE_PATH:'/'},
});
if(result.error)throw result.error;
process.exit(result.status??1);
