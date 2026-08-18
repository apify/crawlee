import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { get } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fetchManifest } from '@crawlee/templates';
import { input, select } from '@inquirer/prompts';
import colors from 'ansi-colors';
function validateProjectName(name) {
    if (name.length === 0) {
        throw new Error('The project name cannot be empty string.');
    }
}
async function rewrite(path, replacer) {
    try {
        const file = await readFile(path, 'utf8');
        const replaced = replacer(file);
        await writeFile(path, replaced);
    }
    catch {
        // not found
    }
}
async function withRetries(func, retries, label) {
    let attempt = 0;
    let lastError;
    while (attempt < retries) {
        try {
            return (await func());
        }
        catch (error) {
            attempt++;
            lastError = error;
            if (attempt < retries) {
                console.warn(`${colors.yellow(`[${label}]`)}: Attempt ${attempt + 1} of ${retries} failed, and will be retried`, error.message || error);
            }
            // Wait 2500ms + (2500 * retries) before giving up to give it some time between retries
            await setTimeout(2500 + 2500 * attempt);
        }
    }
    throw new Error(`${colors.red(`[${label}]`)}: All ${retries} attempts failed, and will not be retried\n\n${lastError.stack || lastError}`);
}
async function downloadTemplateFilesToDisk(template, destinationDirectory) {
    const promises = [];
    for (const file of template.files) {
        const promise = async () => downloadFile(file.url).then(async (buffer) => {
            // Make sure the folder for the file exists
            const fileDirName = dirname(file.path);
            const fileFolder = resolve(destinationDirectory, fileDirName);
            await mkdir(fileFolder, { recursive: true });
            // Write the actual file
            await writeFile(resolve(destinationDirectory, file.path), buffer);
        });
        promises.push(withRetries(promise, 3, `Template: ${template.name}, file: ${file.path}`));
    }
    await Promise.all(promises);
}
async function downloadFile(url) {
    return new Promise((promiseResolve, reject) => {
        get(url, async (res) => {
            const bytes = [];
            res.on('error', (err) => reject(err));
            for await (const byte of res) {
                bytes.push(byte);
            }
            const buff = Buffer.concat(bytes);
            if (res.statusCode !== 200) {
                reject(new Error(`Received ${res.statusCode} ${res.statusMessage}: ${buff.toString('utf8')}`));
                return;
            }
            promiseResolve(buff);
        }).on('error', (err) => reject(err));
    });
}
export class CreateProjectCommand {
    command = 'create [project-name]';
    describe = 'Creates a new Crawlee project directory from a selected boilerplate template.';
    builder = async (args) => {
        const manifest = await fetchManifest();
        const choices = manifest.templates.map((t) => t.name);
        args.positional('project-name', {
            describe: 'Name of the new project folder.',
            type: 'string',
        });
        args.option('template', {
            alias: 't',
            choices,
            describe: 'Template for the project. If not provided, the command will prompt for it.',
        });
        return args;
    };
    /**
     * @inheritDoc
     */
    async handler(args) {
        let { projectName, template } = args;
        // Check proper format of projectName
        if (!projectName) {
            projectName = await input({
                message: 'Name of the new project folder:',
                validate: (promptText) => {
                    try {
                        validateProjectName(promptText);
                    }
                    catch (err) {
                        return err.message;
                    }
                    return true;
                },
            });
        }
        else {
            validateProjectName(projectName);
        }
        const manifest = await withRetries(fetchManifest, 5, 'Template Manifest');
        const choices = manifest.templates.map((t) => ({
            value: t.name,
            name: t.description,
        }));
        if (!template) {
            template = await select({
                message: 'Please select the template for your new Crawlee project',
                default: choices[0],
                choices,
            });
        }
        const projectDir = join(process.cwd(), projectName);
        // Create project directory structure
        try {
            mkdirSync(projectDir);
        }
        catch (err) {
            if (err.code && err.code === 'EEXIST') {
                console.error(`Cannot create new Crawlee project, directory '${projectName}' already exists.`);
                return;
            }
            throw err;
        }
        const templateData = manifest.templates.find((item) => item.name === template);
        await downloadTemplateFilesToDisk(templateData, projectDir);
        await rewrite(resolve(projectDir, 'package.json'), (pkg) => pkg.replace(/"name": "[\w-]+"/, `"name": "${projectName}"`));
        // Run npm install in project dir.
        const npm = process.platform.startsWith('win') ? 'npm.cmd' : 'npm';
        execSync(`${npm} install`, { cwd: projectDir, stdio: 'inherit' });
        console.log(colors.green(`Project ${projectName} was created. To run it, run "cd ${projectName}" and "npm start".`));
    }
}
