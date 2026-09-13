import { PlaywrightCrawler } from 'crawlee';
import { ensureBinary, getDefaultStealthArgs } from 'cloakbrowser';
import { chromium } from 'playwright';

// CloakBrowser is a stealth Chromium binary with source-level C++ fingerprint patches.
// Install: npm install cloakbrowser (binary auto-downloads on first run)
const executablePath = await ensureBinary();
const stealthArgs = getDefaultStealthArgs();

const crawler = new PlaywrightCrawler({
    browserPoolOptions: {
        // Disable the default fingerprint spoofing to avoid conflicts with CloakBrowser.
        useFingerprints: false,
    },
    launchContext: {
        launcher: chromium,
        launchOptions: {
            executablePath,
            args: stealthArgs,
        },
    },
    // ...
});
