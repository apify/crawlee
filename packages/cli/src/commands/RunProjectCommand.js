import { execSync } from 'node:child_process';
export class RunProjectCommand {
    command = 'run';
    describe = 'Run crawlee project';
    builder = async (args) => {
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
    };
    /**
     * @inheritDoc
     */
    async handler(args) {
        const env = { ...process.env };
        if (!args.purge) {
            env.CRAWLEE_PURGE_ON_START = '0';
        }
        // TODO detect the right package manager (e.g. based on package.json's `packageManager` field)
        execSync(`npm run ${args.script}`, { stdio: 'inherit', env });
    }
}
