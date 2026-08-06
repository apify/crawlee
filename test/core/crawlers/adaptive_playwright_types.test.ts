import type { AdaptivePlaywrightCrawlerContext, AdaptivePlaywrightCrawlerOptions } from '@crawlee/playwright';
import type { Dictionary } from '@crawlee/types';

/**
 * Type-level regression test: a request handler typed with custom user data must stay assignable
 * to an untyped `AdaptivePlaywrightCrawlerOptions`, like in the HTTP-based crawlers (issue #2063).
 */

interface OrderUserData extends Dictionary {
    label: string;
}

describe('AdaptivePlaywrightCrawler option types (#2063)', () => {
    test('request handler typed with custom user data stays assignable', () => {
        const requestHandler = async ({ request }: AdaptivePlaywrightCrawlerContext<OrderUserData>) =>
            void request.userData.label;

        const options: AdaptivePlaywrightCrawlerOptions = { requestHandler };

        expect(options).toBeTruthy();
    });
});
