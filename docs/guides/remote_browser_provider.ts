import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';

const apiKey = process.env.BROWSERBASE_API_KEY!;
const projectId = process.env.BROWSERBASE_PROJECT_ID!;

class BrowserbaseProvider extends RemoteBrowserProvider<{ id: string }> {
    // Respect the service's concurrent session limit to avoid 429s.
    maxOpenBrowsers = 5;

    async connect() {
        const response = await fetch('https://api.browserbase.com/v1/sessions', {
            method: 'POST',
            headers: { 'x-bb-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
        }

        const session = (await response.json()) as { id: string; connectUrl: string };
        return { url: session.connectUrl, context: { id: session.id } };
    }

    async release({ id }: { id: string }) {
        await fetch(`https://api.browserbase.com/v1/sessions/${id}`, {
            method: 'POST',
            headers: { 'x-bb-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
        });
    }
}

const crawler = new PlaywrightCrawler({
    launchContext: {
        remoteBrowser: new BrowserbaseProvider(),
    },
    async requestHandler({ page, request, log }) {
        const title = await page.title();
        log.info(`${request.loadedUrl} — "${title}"`);
    },
});

await crawler.run(['https://crawlee.dev']);
