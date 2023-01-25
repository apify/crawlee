import { execSync } from 'node:child_process';
import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';

interface RunProjectArgs {
    purge?: boolean;
    script?: string;
}

export class RunProjectCommand<T> implements CommandModule<T, RunProjectArgs> {
    command = 'run';
    describe = 'Run crawlee project';
    builder = async (args: Argv<T>) => {
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
        return args as Argv<RunProjectArgs>;
    };

    /**
     * @inheritDoc
     */
    async handler(args: ArgumentsCamelCase<RunProjectArgs>) {
        let cmd = '';

        if (!args.purge) {
            cmd += 'CRAWLEE_PURGE_ON_START=0 ';
        }

        // TODO detect the right package manager (e.g. based on package.json's `packageManager` field)
        cmd += `npm run ${args.script}`;

        execSync(cmd, { stdio: 'inherit' });
    }
}
