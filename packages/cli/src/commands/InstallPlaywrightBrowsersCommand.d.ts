import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
interface InstallPlaywrightBrowsersArgs {
    force?: boolean;
}
export declare class InstallPlaywrightBrowsersCommand<T> implements CommandModule<T, InstallPlaywrightBrowsersArgs> {
    command: string;
    describe: string;
    builder: (args: Argv<T>) => Promise<Argv<InstallPlaywrightBrowsersArgs>>;
    handler: (args: ArgumentsCamelCase<InstallPlaywrightBrowsersArgs>) => void;
}
export {};
