import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
interface RunProjectArgs {
    purge?: boolean;
    script?: string;
}
export declare class RunProjectCommand<T> implements CommandModule<T, RunProjectArgs> {
    command: string;
    describe: string;
    builder: (args: Argv<T>) => Promise<Argv<RunProjectArgs>>;
    /**
     * @inheritDoc
     */
    handler(args: ArgumentsCamelCase<RunProjectArgs>): Promise<void>;
}
export {};
//# sourceMappingURL=RunProjectCommand.d.ts.map