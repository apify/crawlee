import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
import { prompt } from 'inquirer';
import colors from 'ansi-colors';
import type { Template } from '@crawlee/templates';
import { fetchManifest } from '@crawlee/templates';
import { resolve } from 'path';
import { readFile, writeFile } from 'node:fs/promises';
import { get } from 'node:https';
import { ensureDir } from 'fs-extra';

interface CreateProjectArgs {
    projectName?: string;
    template?: string;
}

function validateProjectName(name: string) {
    if (name.length === 0) {
        throw new Error('The project name cannot be empty string.');
    }
}

async function rewrite(path: string, replacer: (from: string) => string) {
    try {
        const file = await readFile(path, 'utf8');
        const replaced = replacer(file);
        await writeFile(path, replaced);
    } catch {
        // not found
    }
}

async function downloadTemplateFilesToDisk(template: Template, destinationDirectory: string) {
    const promises: Promise<void>[] = [];

    for (const file of template.files) {
        const promise = downloadFile(file.url).then(async (buffer) => {
            // Make sure the folder for the file exists
            const fileDirName = dirname(file.path);
            const fileFolder = resolve(destinationDirectory, fileDirName);
            await ensureDir(fileFolder);

            // Write the actual file
            await writeFile(resolve(destinationDirectory, file.path), buffer);
        });

        promises.push(promise);
    }

    await Promise.all(promises);
}

async function downloadFile(url: string) {
    return new Promise<Buffer>((promiseResolve, reject) => {
        get(url, async (res) => {
            const bytes: Buffer[] = [];

            res.on('error', (err) => reject(err));

            for await (const byte of res) {
                bytes.push(byte);
            }

            promiseResolve(Buffer.concat(bytes));
        }).on('error', (err) => reject(err));
    });
}

export class CreateProjectCommand<T> implements CommandModule<T, CreateProjectArgs> {
    command = 'create [project-name]';
    describe = 'Creates a new Crawlee project directory from a selected boilerplate template.';
    builder = async (args: Argv<T>) => {
        const manifest = await fetchManifest();
        const choices = manifest.templates.map((t) => t.name);

        args.positional('project-name', {
            describe: 'Name of the new project folder.',
        });
        args.option('template', {
            alias: 't',
            choices,
            describe: 'Template for the project. If not provided, the command will prompt for it.',
        });
        return args as Argv<CreateProjectArgs>;
    };

    /**
     * @inheritDoc
     */
    async handler(args: ArgumentsCamelCase<CreateProjectArgs>) {
        let { projectName, template } = args;

        // Check proper format of projectName
        if (!projectName) {
            const projectNamePrompt = await prompt([{
                name: 'projectName',
                message: 'Name of the new project folder:',
                type: 'input',
                validate: (promptText) => {
                    try {
                        validateProjectName(promptText);
                    } catch (err: any) {
                        return err.message;
                    }
                    return true;
                },
            }]);
            ({ projectName } = projectNamePrompt);
        } else {
            validateProjectName(projectName);
        }

        const manifest = await fetchManifest();
        const choices = manifest.templates.map((t) => ({
            value: t.name,
            name: t.description,
        }));

        if (!template) {
            const answer = await prompt([{
                type: 'list',
                name: 'template',
                message: 'Please select the template for your new Crawlee project',
                default: choices[0],
                choices,
            }]);
            template = answer.template;
        }

        const projectDir = join(process.cwd(), projectName!);

        // Create project directory structure
        try {
            mkdirSync(projectDir);
        } catch (err: any) {
            if (err.code && err.code === 'EEXIST') {
                // eslint-disable-next-line no-console
                console.error(`Cannot create new Crawlee project, directory '${projectName}' already exists.`);
                return;
            }
            throw err;
        }

        const templateData = manifest.templates.find((item) => item.name === template)!;

        await downloadTemplateFilesToDisk(templateData, projectDir);
        await rewrite(resolve(projectDir, 'package.json'), (pkg) => pkg.replace(/"name": "[\w-]+"/, `"name": "${projectName}"`));

        // Run npm install in project dir.
        const npm = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
        execSync(`${npm} install`, { cwd: projectDir, stdio: 'inherit' });

        // eslint-disable-next-line no-console
        console.log(colors.green(`Project ${projectName} was created. To run it, run "cd ${projectName}" and "npm start".`));
    }
}
