"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateProjectCommand = void 0;
const tslib_1 = require("tslib");
/* eslint-disable no-console */
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const promises_1 = require("node:timers/promises");
const node_child_process_1 = require("node:child_process");
const inquirer_1 = require("inquirer");
const ansi_colors_1 = tslib_1.__importDefault(require("ansi-colors"));
const templates_1 = require("@crawlee/templates");
const path_1 = require("path");
const promises_2 = require("node:fs/promises");
const node_https_1 = require("node:https");
const fs_extra_1 = require("fs-extra");
function validateProjectName(name) {
    if (name.length === 0) {
        throw new Error('The project name cannot be empty string.');
    }
}
async function rewrite(path, replacer) {
    try {
        const file = await (0, promises_2.readFile)(path, 'utf8');
        const replaced = replacer(file);
        await (0, promises_2.writeFile)(path, replaced);
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
            return await func();
        }
        catch (error) {
            attempt++;
            lastError = error;
            if (attempt < retries) {
                console.warn(`${ansi_colors_1.default.yellow(`[${label}]`)}: Attempt ${attempt + 1} of ${retries} failed, and will be retried`, error.message || error);
            }
            // Wait 2500ms + (2500 * retries) before giving up to give it some time between retries
            await (0, promises_1.setTimeout)(2500 + (2500 * attempt));
        }
    }
    throw new Error(`${ansi_colors_1.default.red(`[${label}]`)}: All ${retries} attempts failed, and will not be retried\n\n${lastError.stack || lastError}`);
}
async function downloadTemplateFilesToDisk(template, destinationDirectory) {
    const promises = [];
    for (const file of template.files) {
        const promise = () => downloadFile(file.url).then(async (buffer) => {
            // Make sure the folder for the file exists
            const fileDirName = (0, node_path_1.dirname)(file.path);
            const fileFolder = (0, path_1.resolve)(destinationDirectory, fileDirName);
            await (0, fs_extra_1.ensureDir)(fileFolder);
            // Write the actual file
            await (0, promises_2.writeFile)((0, path_1.resolve)(destinationDirectory, file.path), buffer);
        });
        promises.push(withRetries(promise, 3, `Template: ${template.name}, file: ${file.path}`));
    }
    await Promise.all(promises);
}
async function downloadFile(url) {
    return new Promise((promiseResolve, reject) => {
        (0, node_https_1.get)(url, async (res) => {
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
class CreateProjectCommand {
    constructor() {
        Object.defineProperty(this, "command", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'create [project-name]'
        });
        Object.defineProperty(this, "describe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Creates a new Crawlee project directory from a selected boilerplate template.'
        });
        Object.defineProperty(this, "builder", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (args) => {
                const manifest = await (0, templates_1.fetchManifest)();
                const choices = manifest.templates.map((t) => t.name);
                args.positional('project-name', {
                    describe: 'Name of the new project folder.',
                });
                args.option('template', {
                    alias: 't',
                    choices,
                    describe: 'Template for the project. If not provided, the command will prompt for it.',
                });
                return args;
            }
        });
    }
    /**
     * @inheritDoc
     */
    async handler(args) {
        let { projectName, template } = args;
        // Check proper format of projectName
        if (!projectName) {
            const projectNamePrompt = await (0, inquirer_1.prompt)([{
                    name: 'projectName',
                    message: 'Name of the new project folder:',
                    type: 'input',
                    validate: (promptText) => {
                        try {
                            validateProjectName(promptText);
                        }
                        catch (err) {
                            return err.message;
                        }
                        return true;
                    },
                }]);
            ({ projectName } = projectNamePrompt);
        }
        else {
            validateProjectName(projectName);
        }
        const manifest = await withRetries(templates_1.fetchManifest, 5, 'Template Manifest');
        const choices = manifest.templates.map((t) => ({
            value: t.name,
            name: t.description,
        }));
        if (!template) {
            const answer = await (0, inquirer_1.prompt)([{
                    type: 'list',
                    name: 'template',
                    message: 'Please select the template for your new Crawlee project',
                    default: choices[0],
                    choices,
                }]);
            template = answer.template;
        }
        const projectDir = (0, node_path_1.join)(process.cwd(), projectName);
        // Create project directory structure
        try {
            (0, node_fs_1.mkdirSync)(projectDir);
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
        await rewrite((0, path_1.resolve)(projectDir, 'package.json'), (pkg) => pkg.replace(/"name": "[\w-]+"/, `"name": "${projectName}"`));
        // Run npm install in project dir.
        const npm = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
        (0, node_child_process_1.execSync)(`${npm} install`, { cwd: projectDir, stdio: 'inherit' });
        console.log(ansi_colors_1.default.green(`Project ${projectName} was created. To run it, run "cd ${projectName}" and "npm start".`));
    }
}
exports.CreateProjectCommand = CreateProjectCommand;
//# sourceMappingURL=CreateProjectCommand.js.map