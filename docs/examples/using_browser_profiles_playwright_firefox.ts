import os from 'node:os';
import path from 'node:path';

import { PlaywrightCrawler } from 'crawlee';
import { firefox } from 'playwright';

// Replace this with your actual Firefox profile name
// Find it at about:profiles in Firefox
const PROFILE_NAME = 'your-profile-name-here';

// Path to Firefox profile directory (example for Windows)
// Use `about:profiles` to find your profile path
const PROFILE_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles', PROFILE_NAME);

const crawler = new PlaywrightCrawler({
    launchContext: {
        // Use Firefox browser
        launcher: firefox,
        // Path to your Firefox profile
        userDataDir: PROFILE_PATH,
        launchOptions: {
            headless: false,
            args: [
                // Required to avoid version conflicts
                '--allow-downgrade',
            ],
        },
    },
    async requestHandler({ request, log }) {
        log.info(`Visiting ${request.url}`);
    },
});

await crawler.run(['https://crawlee.dev']);
