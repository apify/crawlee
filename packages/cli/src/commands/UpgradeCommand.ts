import { spawnSync } from 'node:child_process';

import ansiColors from 'ansi-colors';
import type { Argv, CommandModule } from 'yargs';

const upgradePackage = '@crawlee/upgrade';

export class UpgradeCommand<T> implements CommandModule<T> {
    command = 'upgrade';
    describe = `Prints an AI migration prompt for upgrading the project (runs \`npx ${upgradePackage}\`)`;

    builder = async (args: Argv<T>) => {
        // the options belong to `@crawlee/upgrade`, so we forward them all instead of validating them here
        return args.strict(false).help(false).version(false);
    };

    handler = () => {
        const forwardedArgs = process.argv.slice(process.argv.indexOf(this.command) + 1);
        const result = spawnSync('npx', [upgradePackage, ...forwardedArgs], {
            stdio: 'inherit',
            // `npx` is a `.cmd` file on Windows, which can be spawned only via shell
            shell: process.platform === 'win32',
        });

        if (result.status === 0) {
            return;
        }

        console.error(
            ansiColors.red(
                `Failed to run \`${upgradePackage}\`, please run \`npx ${[upgradePackage, ...forwardedArgs].join(' ')}\` yourself.`,
            ),
        );
        process.exitCode = result.status ?? 1;
    };
}
