import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { runExampleComServer } from '../shared/_helper.js';

/**
 * Runs the instrumentation the way a user does: through Node's module hook, in a process that was never told about
 * the instrumentation in its own code.
 *
 * The other tests in this directory apply the module patches by hand, which covers what the patches do but not
 * whether they are ever delivered. Delivery has its own failure mode: the hook has to be registered before anything
 * imports Crawlee, and nothing inside the crawler's own process can tell that it was not.
 *
 * The fixtures are deliberately the same three files the guide tells users to write, so this also fails if the guide's
 * setup stops working.
 */
describe('module hook delivery', () => {
    const root = resolve(__dirname, '../..');
    const fixture = (name: string) => `./${join('test/otel/fixtures', name)}`;

    let server: Server;
    let serverAddress: string;
    let outputDir: string;

    beforeAll(async () => {
        const [startedServer, port] = await runExampleComServer();
        server = startedServer;
        serverAddress = `http://localhost:${port}`;
        outputDir = mkdtempSync(join(tmpdir(), 'crawlee-otel-'));
    });

    afterAll(async () => {
        rmSync(outputDir, { recursive: true, force: true });
        await new Promise((done) => server.close(done));
    });

    test('instruments a crawler that only ever imports Crawlee', async () => {
        const output = join(outputDir, 'spans.json');

        await promisify(execFile)(
            join(root, 'node_modules/.bin/tsx'),
            ['--import', fixture('register-hook.ts'), '--import', fixture('otel-setup.ts'), fixture('crawler.ts')],
            {
                cwd: root,
                env: {
                    ...process.env,
                    CRAWLEE_OTEL_SMOKE_OUTPUT: output,
                    CRAWLEE_OTEL_SMOKE_URL: serverAddress,
                },
            },
        );

        const spans = JSON.parse(readFileSync(output, 'utf8')) as string[];

        // One span from each patched module that a `CheerioCrawler` run reaches, so a hook that never fires
        // shows up as an empty list rather than as a silently smaller trace.
        expect(spans.sort()).toEqual([
            'crawlee.crawler.handleRequest',
            'crawlee.crawler.run',
            'crawlee.crawler.runRequestHandler',
            'crawlee.http.makeHttpRequest',
        ]);
    }, 180_000); // A cold child process has to load and transpile the whole crawler dependency graph.
});
