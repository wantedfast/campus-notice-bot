import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e', fullyParallel:false, workers:1, timeout:30000,
  use:{baseURL:'http://127.0.0.1:3199',headless:true,trace:'retain-on-failure'},
  webServer:{command:'npx tsx scripts/test-server.ts',url:'http://127.0.0.1:3199/api/notices',reuseExistingServer:false,timeout:60000},
  reporter:'list'
});
