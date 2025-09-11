import fs from 'node:fs/promises';
import path from 'node:path';

const BUILD_DIR = path.resolve('build');

const LLMS_TXT_URL = 'https://crawlee.dev/python/llms.txt';
const LLMS_FULL_TXT_URL = 'https://crawlee.dev/python/llms-full.txt';

async function fetchFile(route) {
    try {
        const res = await fetch(route);
        if (!res.ok) throw new Error(`Failed to fetch ${route}: ${res.status}`);
        return await res.text();
    } catch (err) {
        console.error(`Error fetching ${route}:`, err.message);
        return '';
    }
}

async function joinFiles() {
    await fs.mkdir(BUILD_DIR, { recursive: true });
    // Fetch and write llms.txt
    const llmsTxtContent = await fetchFile(LLMS_TXT_URL);
    if (llmsTxtContent) {
        await fs.writeFile(path.join(BUILD_DIR, 'llms.txt'), llmsTxtContent, 'utf8');
        console.log('Wrote llms.txt to build/');
    }
    // Fetch and write llms-full.txt
    const llmsFullTxtContent = await fetchFile(LLMS_FULL_TXT_URL);
    if (llmsFullTxtContent) {
        await fs.writeFile(path.join(BUILD_DIR, 'llms-full.txt'), llmsFullTxtContent, 'utf8');
        console.log('Wrote llms-full.txt to build/');
    }
}

async function sanitizeFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const sanitizedContent = content.replace(/<[^>]*>/g, ''); // Remove HTML tags
    await fs.writeFile(filePath, sanitizedContent, 'utf8');
    console.log(`Sanitized ${filePath}`);
}

joinFiles().catch((err) => {
    console.error('Failed to join LLMs files:', err);
    process.exit(1);
});

await sanitizeFile(path.join(BUILD_DIR, 'llms.txt'));
await sanitizeFile(path.join(BUILD_DIR, 'llms-full.txt'));
