"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunProjectCommand = void 0;
const node_child_process_1 = require("node:child_process");
class RunProjectCommand {
    constructor() {
        Object.defineProperty(this, "command", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'run'
        });
        Object.defineProperty(this, "describe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Run crawlee project'
        });
        Object.defineProperty(this, "builder", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: async (args) => {
                args.option('purge', {
                    alias: 't',
                    default: true,
                    type: 'boolean',
                    describe: 'Use `--no-purge` to disable automatic purging of default storages.',
                });
                args.option('script', {
                    alias: 's',
                    default: 'start',
                    describe: 'Allows using different NPM script than `start`, e.g. `crawlee run --script=start:prod`.',
                });
                return args;
            }
        });
    }
    /**
     * @inheritDoc
     */
    async handler(args) {
        let cmd = '';
        if (!args.purge) {
            cmd += 'CRAWLEE_PURGE_ON_START=0 ';
        }
        // TODO detect the right package manager (e.g. based on package.json's `packageManager` field)
        cmd += `npm run ${args.script}`;
        (0, node_child_process_1.execSync)(cmd, { stdio: 'inherit' });
    }
}
exports.RunProjectCommand = RunProjectCommand;
//# sourceMappingURL=RunProjectCommand.js.map