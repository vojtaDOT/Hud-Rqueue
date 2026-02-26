import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/smoke',
    timeout: 60_000,
    retries: 0,
    use: {
        baseURL: 'http://127.0.0.1:3101',
        headless: true,
    },
    webServer: {
        command: 'npm run build && PORT=3101 HOSTNAME=127.0.0.1 node .next/standalone/server.js',
        url: 'http://127.0.0.1:3101',
        reuseExistingServer: true,
        timeout: 300_000,
    },
});
