import { spawnSync } from 'node:child_process';

import ansiColors from 'ansi-colors';
import type { Argv, CommandModule } from 'yargs';

const latestCommand = ['crawlee@latest', 'upgrade'];
const handoverVariable = 'CRAWLEE_UPGRADE_HANDOVER';

export class UpgradeCommand<T> implements CommandModule<T> {
    command = 'upgrade';
    describe = 'Prints an AI migration prompt for upgrading the project (runs the latest Crawlee CLI via `npx`)';

    builder = async (args: Argv<T>) => {
        // the options belong to the latest CLI, so we forward them all instead of validating them here
        return args.strict(false).help(false).version(false);
    };

    handler = () => {
        // while `latest` is still v3, the spawned CLI is this same command and would spawn itself forever
        if (process.env[handoverVariable]) {
            console.error(ansiColors.red('The latest Crawlee CLI does not have the `upgrade` command yet.'));
            process.exitCode = 1;
            return;
        }

        const forwardedArgs = process.argv.slice(process.argv.indexOf(this.command) + 1);
        const result = spawnSync('npx', [...latestCommand, ...forwardedArgs], {
            stdio: 'inherit',
            env: { ...process.env, [handoverVariable]: '1' },
            // `npx` is a `.cmd` file on Windows, which can be spawned only via shell
            shell: process.platform === 'win32',
        });

        if (result.status === 0) {
            return;
        }

        console.error(
            ansiColors.red(
                `Failed to run the latest Crawlee CLI, please run \`npx ${[...latestCommand, ...forwardedArgs].join(' ')}\` yourself.`,
            ),
        );
        process.exitCode = result.status ?? 1;
    };
}
