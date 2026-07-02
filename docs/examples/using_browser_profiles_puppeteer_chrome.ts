import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PuppeteerCrawler } from 'crawlee';

// Profile name to use (usually 'Default' for single profile setups)
const PROFILE_NAME = 'Default';

// Path to Chrome user data directory (example for Windows)
// Use `chrome://version/` to find your profile path
const PROFILE_PATH = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');

// Copy profile to a temp directory to avoid Chrome's lock
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawlee-chrome-profile-'));
fs.cpSync(path.join(PROFILE_PATH, PROFILE_NAME), path.join(tempDir, PROFILE_NAME), { recursive: true });

const crawler = new PuppeteerCrawler({
    launchContext: {
        // Use the installed Chrome browser
        useChrome: true,
        launchOptions: {
            headless: false,
            // Set user data directory via Puppeteer launch options
            userDataDir: tempDir,
            // Slow down actions to mimic human behavior
            slowMo: 200,
            args: [
                // Use the specified profile
                `--profile-directory=${PROFILE_NAME}`,
            ],
        },
    },
    async requestHandler({ request, log }) {
        log.info(`Visiting ${request.url}`);
    },
});

await crawler.run(['https://crawlee.dev']);

// Clean up the temp profile
fs.rmSync(tempDir, { recursive: true, force: true });
