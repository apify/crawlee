import { createWriteStream, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ReadableStream } from 'stream/web';

import AdmZip from 'adm-zip';
import { ensureFileSync } from 'fs-extra';

const PATH_TO_ZIP = join(import.meta.dirname, '..', 'binaries', 'camoufox.zip');
const PATH_TO_CAMOUFOX_HOME = join(import.meta.dirname, '..', 'binaries', 'camoufox');
const PATH_TO_CAMOUFOX_BINARY = join(PATH_TO_CAMOUFOX_HOME, 'camoufox');

function getOs() {
    const platforms = {
        win32: 'win',
        darwin: 'mac',
        linux: 'lin',
    };

    const platform = platforms[process.platform];
    if (!platform) {
        throw new Error(`Unsupported platform: ${process.platform}`);
    }

    return platform;
}

function getArch() {
    const archs = {
        x64: 'x86_64',
        arm64: 'arm64',
    };

    const arch = archs[process.arch];
    if (!arch) {
        throw new Error(`Unsupported architecture: ${process.arch}`);
    }

    return arch;
}

async function getBinaryUrl() {
    const releases = await fetch('https://api.github.com/repos/daijro/camoufox/releases').then(async (x) => x.json());

    const os = getOs();
    const arch = getArch();

    const asset = releases[0].assets.find((x) => x.name.includes(`-${os}.${arch}`));

    if (!asset) {
        throw new Error(`No asset found for ${os}.${arch}`);
    }

    return asset.browser_download_url;
}

async function downloadZipAsset(url: string) {
    if (!existsSync(PATH_TO_ZIP)) {
        ensureFileSync(PATH_TO_ZIP);
        const fileStream = createWriteStream(PATH_TO_ZIP);
        const response = await fetch(url);

        const total = Number(response.headers.get('content-length'));

        const downloadStream = Readable.fromWeb(response.body as ReadableStream<any>);

        let progress = 0;
        downloadStream.on('data', (chunk) => {
            if (Math.floor(progress / 1e7) < Math.floor((progress + chunk.length) / 1e7)) {
                console.log(`Downloaded ${progress} bytes (${((progress / total) * 100).toFixed(2)}%)`);
            }
            progress += chunk.length;
        });

        return pipeline([downloadStream, fileStream]);
    }

    console.log('Camoufox seems to already exist in the current directory. Skipping download.');
}

function extractZip() {
    const zip = new AdmZip(PATH_TO_ZIP);
    zip.extractAllTo(PATH_TO_CAMOUFOX_HOME, true);
    console.log('Extracted Camoufox to', PATH_TO_CAMOUFOX_HOME);

    chmodSync(PATH_TO_CAMOUFOX_BINARY, 0o755);
}

async function main() {
    console.log('Searching for latest Camoufox release...');

    const binaryUrl = await getBinaryUrl();

    console.log('Downloading Camoufox (this may take a while)...', binaryUrl);

    await downloadZipAsset(binaryUrl);

    console.log('Extracting Camoufox...');

    extractZip();
}

void main();
