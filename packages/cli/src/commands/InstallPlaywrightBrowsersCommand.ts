import { execSync } from 'node:child_process';

import ansiColors from 'ansi-colors';
import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';

const envVariable = 'CRAWLEE_SKIP_BROWSER_INSTALL';

interface InstallPlaywrightBrowsersArgs {
    force?: boolean;
}

export class InstallPlaywrightBrowsersCommand<T> implements CommandModule<T, InstallPlaywrightBrowsersArgs> {
    command = 'install-playwright-browsers';
    describe = 'Installs browsers needed by Playwright for local testing';

    builder = async (args: Argv<T>) => {
        args.options('force', {
            alias: 'f',
            default: false,
            type: 'boolean',
            describe:
                'Use `--force` to force installation of browsers even if the environment is marked as having them.',
        });

        return args as Argv<InstallPlaywrightBrowsersArgs>;
    };

    handler = (args: ArgumentsCamelCase<InstallPlaywrightBrowsersArgs>) => {
        if (process.env[envVariable]) {
            if (!args.force) {
                console.log(ansiColors.green('Browsers are already installed!'));
                return;
            }

            console.warn(
                ansiColors.yellow(
                    'Installing Playwright browsers in an environment where browsers have already been installed...',
                ),
            );
        } else {
            console.log(ansiColors.green('Installing Playwright browsers...'));
        }

        // TODO: detect package manager
        execSync(`npx playwright install`, { stdio: 'inherit' });
    };
}
