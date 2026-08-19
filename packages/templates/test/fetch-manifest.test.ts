import { readFile } from 'node:fs/promises';

const { httpsGetMock } = vi.hoisted(() => ({
    httpsGetMock: vi.fn(() => {
        throw new Error('Unexpected network access');
    }),
}));

vi.mock('node:https', () => ({
    default: {
        get: httpsGetMock,
    },
    get: httpsGetMock,
}));

import { fetchManifest } from '../src';

describe('fetchManifest', () => {
    test('loads packaged templates without fetching mutable remote files', async () => {
        const manifest = await fetchManifest();

        expect(httpsGetMock).not.toHaveBeenCalled();
        expect(manifest.templates.length).toBeGreaterThan(0);
        expect(manifest.templates[0].files.length).toBeGreaterThan(0);
        expect(manifest.templates[0].files[0].url.startsWith('file://')).toBe(true);
        await expect(readFile(new URL(manifest.templates[0].files[0].url), 'utf8')).resolves.toEqual(expect.any(String));
    });
});
