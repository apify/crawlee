import { createUpgradePrompt, type UpgradeOptions } from '@crawlee/upgrade';
import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';

export class UpgradeCommand<T> implements CommandModule<T, UpgradeOptions> {
    command = 'upgrade';
    describe = 'Prints an AI migration prompt, upgrading one Crawlee major at a time';

    builder = (args: Argv<T>) =>
        args
            .option('from', { type: 'number', describe: 'Starting major version; defaults to the project version' })
            .option('to', {
                type: 'number',
                describe: 'Target major version; defaults to the newest bundled migration',
            })
            .option('export', {
                type: 'string',
                describe: 'Copy the migration guides into this directory and link the prompt to that copy',
            });

    async handler(args: ArgumentsCamelCase<UpgradeOptions>) {
        const prompt = await createUpgradePrompt({ from: args.from, to: args.to, export: args.export });
        process.stdout.write(`${prompt}\n`);
    }
}
