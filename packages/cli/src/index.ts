#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('yargonaut')
    .style('blue')
    .style('yellow', 'required')
    .helpStyle('green')
    .errorsStyle('red');

// eslint-disable-next-line
import { CreateProjectCommand } from './commands/CreateProjectCommand';
// eslint-disable-next-line
import { RunProjectCommand } from './commands/RunProjectCommand';

// eslint-disable-next-line
import yargs from 'yargs';

function getCLIVersion(): string {
    try {
        // this works during development (where we have `src` folder)
        // eslint-disable-next-line
        return require('../package.json').version;
    } catch {
        // this works in production build (where we do not have the `src` folder)
        // eslint-disable-next-line
        return require('./package.json').version;
    }
}

const cli = yargs.scriptName('crawlee')
    .version(getCLIVersion())
    .usage('Usage: $0 <command> [options]')
    .example('$0 run --no-purge', 'Runs the project in current working directory and disables automatic purging of default storages')
    .alias('v', 'version')
    .alias('h', 'help')
    .command(new CreateProjectCommand())
    .command(new RunProjectCommand())
    .recommendCommands()
    .strict();

void (async () => {
    const args = await cli.parse(process.argv.slice(2)) as { _: string[] };

    if (args._.length === 0) {
        yargs.showHelp();
    }
})();
