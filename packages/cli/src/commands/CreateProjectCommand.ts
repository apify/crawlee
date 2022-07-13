import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
import { prompt } from 'inquirer';
import colors from 'ansi-colors';
import { fetchManifest } from '@crawlee/templates';
import { copy } from 'fs-extra';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface CreateProjectArgs {
    projectName?: string;
    template?: string;
}

function validateProjectName(name: string) {
    if (name.length === 0) {
        throw new Error('The project name cannot be empty string.');
    }
}

function rewrite(path: string, replacer: (from: string) => string): void {
    try {
        const file = readFileSync(path).toString();
        const replaced = replacer(file);
        writeFileSync(path, replaced);
    } catch {
        // not found
    }
}

export class CreateProjectCommand<T> implements CommandModule<T, CreateProjectArgs> {
    command = 'create [project-name]';
    describe = 'Creates a new Crawlee project directory from a selected boilerplate template.';
    builder = async (args: Argv) => {
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

        await copy(require.resolve('@crawlee/templates').replace('index.js', `templates/${template}`), projectDir);
        rewrite(resolve(projectDir, 'package.json'), (pkg) => pkg.replace(/"name": "[\w-]+"/, `"name": "${projectName}"`));

        // Run npm install in project dir.
        const npm = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
        execSync(`${npm} install`, { cwd: projectDir, stdio: 'inherit' });

        // eslint-disable-next-line no-console
        console.log(colors.green(`Project ${projectName} was created. To run it, run "cd ${projectName}" and "crawlee run".`));
    }
}
