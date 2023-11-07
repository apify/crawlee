/// <reference types="bun-types" />

import { inspect } from 'node:util';

import * as core from '@actions/core';
import * as github from '@actions/github';
import { satisfies } from 'semver';

if (!process.env.ACTIONS_TOKEN) {
    throw new Error('ACTIONS_TOKEN not set');
}

core.debug('Creating octokit instance');
export const octokit = github.getOctokit(process.env.ACTIONS_TOKEN);

const minimumPlaywrightVersion = '>= 1.x';
const minimumPuppeteerVersion = '>= 10.x';

export async function fetchModuleVersions(module: string, limit?: number) {
    const res = await fetch(`https://registry.npmjs.org/${module}`, {
        headers: {
            accept: 'application/vnd.npm.install-v1+json',
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch ${module} versions`);
    }

    const json = await res.json();

    // Get all stable releases (they don't include a `-` in their version string)
    const versions = Object.keys(json.versions).filter((v) => !v.includes('-'));

    switch (module) {
        case 'playwright': {
            const filtered = versions.filter((v) => satisfies(v, minimumPlaywrightVersion));

            if (limit) {
                return filtered.slice(limit * -1);
            }

            return filtered;
        }
        case 'puppeteer': {
            const filtered = versions.filter((v) => satisfies(v, minimumPuppeteerVersion));

            if (limit) {
                return filtered.slice(limit * -1);
            }

            return filtered;
        }
        default: {
            if (limit) {
                return versions.slice(limit * -1);
            }

            return versions;
        }
    }
}

let owner = 'apify';
let repo = 'apify-actor-docker';

if (process.env.CUSTOM_DISPATCH_REPOSITORY) {
    [owner, repo] = process.env.CUSTOM_DISPATCH_REPOSITORY.split('/');
}

core.debug(`Repository: ${owner}/${repo}`);

export async function triggerAction({ eventType, ...inputs }: ActionInputs) {
    core.debug(`Inputs: ${inspect(inputs)}; eventType: ${eventType}`);

    try {
        await octokit.rest.repos.createDispatchEvent({
            owner,
            repo,
            event_type: eventType,
            client_payload: {
                ...inputs,
            },
        });
    } catch (err) {
        core.debug(inspect(err));
        if (err instanceof Error) {
            if ('status' in err && err.status === 404) {
                core.setFailed(`Token has missing permissions possibly`);
            } else {
                core.setFailed(err.message);
            }
        } else {
            core.setFailed(`Failed to trigger action: ${inspect(err)}`);
        }
    }
}

export interface ActionInputs {
    eventType: string;
    release_tag: 'latest' | 'beta';
    apify_version: string;
    crawlee_version: string;
    puppeteer_version: string;
    playwright_version: string;
    is_latest_browser_image: boolean;
}

export enum EventType {
    // Deploys all images, across all browsers. USE WITH CARE
    AllImages = 'build-node-images',
    Playwright = 'build-node-images-playwright',
    Puppeteer = 'build-node-images-puppeteer',
    Node = 'build-node-image-only',
}
