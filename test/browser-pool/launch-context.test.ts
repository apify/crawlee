import { LaunchContext } from '@crawlee/browser-pool';

const createLaunchContext = () =>
    new LaunchContext({ id: 'id', browserPlugin: {} as never, launchOptions: {} as never });

describe('LaunchContext', () => {
    test('extend() attaches custom fields', () => {
        const context = createLaunchContext();
        context.extend({ one: 1, two: 'two' });

        expect(context.one).toBe(1);
        expect(context.two).toBe('two');
    });

    test('extend() rejects every declared field as reserved', () => {
        const context = createLaunchContext();

        // Includes `fingerprint`, `proxyUrl` and `remoteToken`, which slipped through the check in v3.
        const reservedKeys = [
            'id',
            'browserPlugin',
            'launchOptions',
            'fingerprint',
            'proxyUrl',
            'remoteToken',
            'extend',
        ];

        for (const key of reservedKeys) {
            expect(() => context.extend({ [key]: 'anything' })).toThrow(
                `Cannot extend LaunchContext with key: ${key}, because it's reserved.`,
            );
        }
    });

    test('declared fields are set directly instead', () => {
        const context = createLaunchContext();

        const fingerprint = { fingerprint: {}, headers: {} } as never;
        context.fingerprint = fingerprint;
        expect(context.fingerprint).toBe(fingerprint);

        context.proxyUrl = 'http://proxy.com:1111/';
        // The setter normalizes the URL (no trailing slash).
        expect(context.proxyUrl).toBe('http://proxy.com:1111');
    });
});
