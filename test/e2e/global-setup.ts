import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pack, type Pack } from 'apify-test-tools/ad-hoc';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
    export interface ProvidedContext {
        packs: Pack[];
    }
}

/** Packs every workspace package once per run; the tests pin their Actors to those tarballs. Expects `pnpm build` to have run. */
export default async function setup(project: TestProject) {
    if (!process.env.TESTER_APIFY_TOKEN) {
        throw new Error('E2E tests need TESTER_APIFY_TOKEN');
    }
    const dest = await mkdtemp(join(tmpdir(), 'crawlee-packs-'));
    project.provide('packs', await pack(process.cwd(), dest, { recursive: true }));
}
