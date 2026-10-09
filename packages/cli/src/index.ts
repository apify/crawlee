#!/usr/bin/env node

// eslint-disable-next-line
import { CreateProjectCommand } from './commands/create-project-command.js';

import { InstallPlaywrightBrowsersCommand } from './commands/install-playwright-browsers-command.js';

import { RunProjectCommand } from './commands/run-project-command.js';

import { UpgradeCommand } from './commands/UpgradeCommand.js';

import { createRequire } from 'node:module';
import yargs from 'yargs';

const require = createRequire(import.meta.url);

function getCLIVersion(): string {
    try {
        // this works during development (where we have `src` folder)
        return require('../package.json').version;
    } catch {
        // this works in production build (where we do not have the `src` folder)
        return require('./package.json').version;
    }
}

const cli = yargs()
    .scriptName('crawlee')
    .version(getCLIVersion())
    .usage('Usage: $0 <command> [options]')
    .example(
        '$0 run --no-purge',
        'Runs the project in current working directory and disables automatic purging of default storages',
    )
    .alias('v', 'version')
    .alias('h', 'help')
    .command(new CreateProjectCommand())
    .command(new RunProjectCommand())
    .command(new InstallPlaywrightBrowsersCommand())
    .command(new UpgradeCommand())
    .recommendCommands()
    .showHelpOnFail(false)
    .fail((message, error, instance) => {
        if (error) {
            console.error(error.message);
        } else {
            instance.showHelp();
            console.error(`\n${message}`);
        }
        process.exit(1);
    })
    .demandCommand(1, '')
    .strict();

void (async () => {
    const args = (await cli.parse(process.argv.slice(2))) as { _: string[] };

    if (args._.length === 0) {
        yargs(process.argv.slice(2)).showHelp();
    }
})();
