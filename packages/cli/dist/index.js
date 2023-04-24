#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('yargonaut')
    .style('blue')
    .style('yellow', 'required')
    .helpStyle('green')
    .errorsStyle('red');
// eslint-disable-next-line
const CreateProjectCommand_1 = require("./commands/CreateProjectCommand");
// eslint-disable-next-line
const RunProjectCommand_1 = require("./commands/RunProjectCommand");
// eslint-disable-next-line
const yargs_1 = tslib_1.__importDefault(require("yargs"));
function getCLIVersion() {
    try {
        // this works during development (where we have `src` folder)
        // eslint-disable-next-line
        return require('../package.json').version;
    }
    catch {
        // this works in production build (where we do not have the `src` folder)
        // eslint-disable-next-line
        return require('./package.json').version;
    }
}
const cli = yargs_1.default.scriptName('crawlee')
    .version(getCLIVersion())
    .usage('Usage: $0 <command> [options]')
    .example('$0 run --no-purge', 'Runs the project in current working directory and disables automatic purging of default storages')
    .alias('v', 'version')
    .alias('h', 'help')
    .command(new CreateProjectCommand_1.CreateProjectCommand())
    .command(new RunProjectCommand_1.RunProjectCommand())
    .recommendCommands()
    .strict();
void (async () => {
    const args = await cli.parse(process.argv.slice(2));
    if (args._.length === 0) {
        yargs_1.default.showHelp();
    }
})();
//# sourceMappingURL=index.js.map