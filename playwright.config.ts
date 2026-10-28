import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',
  timeout:45_000,
  use:{baseURL:'http://127.0.0.1:4178',headless:true,trace:'retain-on-failure',...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})},
  webServer:{command:'npm start',url:'http://127.0.0.1:4178/api/health',env:{PORT:'4178'},reuseExistingServer:false,timeout:30_000},
  workers:1,
});
