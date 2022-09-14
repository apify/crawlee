import { readFile, readdir, access } from 'node:fs/promises';
import { URL } from 'node:url';

const colors = {
    red: (text) => `\x1B[31m${text}\x1B[39m`,
    green: (text) => `\x1B[32m${text}\x1B[39m`,
    grey: (text) => `\x1B[90m${text}\x1B[39m`,
    yellow: (text) => `\x1B[33m${text}\x1B[39m`,
};

const templatesDirectory = new URL('../templates/', import.meta.url);
const templateNames = await readdir(templatesDirectory);
/** @type {{ templates: Array<{ name: string; description: string; files: string[] }>; }} */
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

console.log(`Validating ${colors.green(manifest.templates.length)} templates`);

let hasError = false;

for (const manifestTemplate of manifest.templates) {
    // Check if the folder it points to actually exists
    if (!templateNames.includes(manifestTemplate.name)) {
        console.error(colors.red(`Failed to find folder for template called ${colors.yellow(manifestTemplate.name)}`));
        hasError = true;
        // Skipping the rest of the validation as the template is missing
        continue;
    }

    console.log(colors.grey(`Validating template ${colors.yellow(manifestTemplate.name)}`));

    // Check that all files it requires exist
    for (const requiredFile of manifestTemplate.files) {
        try {
            await access(new URL(`./${manifestTemplate.name}/${requiredFile}`, templatesDirectory));
        } catch (err) {
            if (err.code === 'ENOENT') {
                hasError = true;
                console.error(`${colors.grey(`[${colors.yellow(manifestTemplate.name)}]:`)} Failed to find file ${colors.yellow(requiredFile)}`);
                console.error(err);
            } else {
                console.warn(`${colors.grey(`[${colors.yellow(manifestTemplate.name)}]:`)} Failed to read file ${colors.yellow(requiredFile)}`, err);
            }
        }
    }

    console.log(colors.green(`Finished validating ${colors.yellow(manifestTemplate.name)}`));
}

process.exitCode = hasError ? 1 : 0;
