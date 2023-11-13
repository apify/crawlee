/*
The main entry point of the docker action.

The following env variables are available:
- ACTIONS_TOKEN - required; a GitHub PAT
- CRAWLEE_BETA_VERSION - if set, the action will deploy to the beta channel, and for the specified crawlee version
- CUSTOM_DISPATCH_REPOSITORY - if set, the action will dispatch to the specified repository instead of apify/apify-actor-docker

Run with `bun run-ci` in the actions/docker-images directory.
*/

/// <reference types="bun-types" />

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect } from 'node:util';

import { debug, info } from '@actions/core';

import { fetchModuleVersions, type ActionInputs, EventType, triggerAction } from './api.ts';

const statePath = join(import.meta.dir, 'state.json');

interface StateFile {
    crawleeVersion?: string;
    puppeteerVersions?: string[];
    playwrightVersions?: string[];
}

const state = JSON.parse(await readFile(statePath, 'utf-8')) as StateFile;
debug(`State file: ${inspect(state)}`);

const crawleeVersion: string = JSON.parse(
    await readFile(new URL('../../../packages/crawlee/package.json', import.meta.url), 'utf-8'),
).version;
debug(`Crawlee version: ${crawleeVersion}`);

const apifyVersion: string = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf-8')).devDependencies?.apify
    ?? 'latest';
debug(`Apify version: ${apifyVersion}`);

const lastPlaywrightVersions = await fetchModuleVersions('playwright', 5);
debug(`Last 5 playwright versions: ${lastPlaywrightVersions.join(', ')}`);

const lastPuppeteerVersions = await fetchModuleVersions('puppeteer', 5);
debug(`Last 5 puppeteer versions: ${lastPuppeteerVersions.join(', ')}`);

const apiCalls: ActionInputs[] = [];
const newState: StateFile = {
    playwrightVersions: [],
    puppeteerVersions: [],
    crawleeVersion: state.crawleeVersion,
};

if (process.env.CRAWLEE_BETA_VERSION) {
    info(`👀 Crawlee beta version detected, deploying to beta channel`);
    debug(
        `Crawlee:${process.env.CRAWLEE_BETA_VERSION} Puppeteer:${lastPuppeteerVersions.at(
            -1,
        )} Playwright:${lastPlaywrightVersions.at(-1)} Apify:${apifyVersion}`,
    );

    apiCalls.push({
        eventType: EventType.AllImages,
        apify_version: 'beta',
        crawlee_version: process.env.CRAWLEE_BETA_VERSION,
        playwright_version: lastPlaywrightVersions.at(-1)!,
        puppeteer_version: lastPuppeteerVersions.at(-1)!,
        release_tag: 'beta',
        is_latest_browser_image: true,
    });

    // Keep the old state in place
    newState.playwrightVersions = state.playwrightVersions;
    newState.puppeteerVersions = state.puppeteerVersions;
} else {
    // Step 1. Adjust the playwright/puppeteer versions to the latest 5
    newState.playwrightVersions = lastPlaywrightVersions;
    newState.puppeteerVersions = lastPuppeteerVersions;

    // Step 2. If crawlee versions differ, we deploy images regardless of the browser versions
    newState.crawleeVersion = crawleeVersion;

    if (state.crawleeVersion === crawleeVersion) {
        // Step 3. Find all versions that are not yet deployed for each browser
        for (const [index, newPlaywrightVersion] of lastPlaywrightVersions.entries()) {
            if (!state.playwrightVersions?.includes(newPlaywrightVersion)) {
                info(`👀 New playwright version detected: ${newPlaywrightVersion}, scheduling for deploy`);
                apiCalls.push({
                    eventType: EventType.Playwright,
                    apify_version: apifyVersion,
                    crawlee_version: crawleeVersion,
                    playwright_version: newPlaywrightVersion,
                    // Doesn't matter as this will only trigger playwright images
                    puppeteer_version: '0.0.0',
                    release_tag: 'latest',
                    is_latest_browser_image: index === lastPlaywrightVersions.length - 1,
                });
            }
        }

        for (const [index, newPuppeteerVersion] of lastPuppeteerVersions.entries()) {
            if (!state.puppeteerVersions?.includes(newPuppeteerVersion)) {
                info(`👀 New puppeteer version detected: ${newPuppeteerVersion}, scheduling for deploy`);
                apiCalls.push({
                    eventType: EventType.Puppeteer,
                    apify_version: apifyVersion,
                    crawlee_version: crawleeVersion,
                    // Doesn't matter as this will only trigger puppeteer images
                    playwright_version: '0.0.0',
                    puppeteer_version: newPuppeteerVersion,
                    release_tag: 'latest',
                    is_latest_browser_image: index === lastPuppeteerVersions.length - 1,
                });
            }
        }
    } else {
        for (const [index, newPuppeteerVersion] of lastPuppeteerVersions.entries()) {
            info(`👀 Scheduling build for puppeteer: ${newPuppeteerVersion} and crawlee ${crawleeVersion} for deploy`);

            apiCalls.push({
                eventType: EventType.Puppeteer,
                apify_version: apifyVersion,
                crawlee_version: crawleeVersion,
                // Doesn't matter as this will only trigger puppeteer images
                playwright_version: '0.0.0',
                puppeteer_version: newPuppeteerVersion,
                release_tag: 'latest',
                is_latest_browser_image: index === lastPuppeteerVersions.length - 1,
            });
        }

        for (const [index, newPlaywrightVersion] of lastPlaywrightVersions.entries()) {
            info(
                `👀 Scheduling build for playwright: ${newPlaywrightVersion} and crawlee ${crawleeVersion} for deploy`,
            );

            apiCalls.push({
                eventType: EventType.Playwright,
                apify_version: apifyVersion,
                crawlee_version: crawleeVersion,
                playwright_version: newPlaywrightVersion,
                // Doesn't matter as this will only trigger playwright images
                puppeteer_version: '0.0.0',
                release_tag: 'latest',
                is_latest_browser_image: index === lastPlaywrightVersions.length - 1,
            });
        }

        info(`👀 Scheduling build for node image with crawlee ${crawleeVersion} for deploy`);
        apiCalls.push({
            eventType: EventType.Node,
            apify_version: apifyVersion,
            crawlee_version: crawleeVersion,
            is_latest_browser_image: true,
            playwright_version: '0.0.0',
            puppeteer_version: '0.0.0',
            release_tag: 'latest',
        });
    }
}

info(`🚀 Triggering ${apiCalls.length} actions`);
await Promise.all(apiCalls.map(async (data) => triggerAction(data)));
info(`📝 Updating state file`);
await writeFile(statePath, JSON.stringify(newState, null, '\t'));

info(`✅ Done`);
