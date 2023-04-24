import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';
interface CreateProjectArgs {
    projectName?: string;
    template?: string;
}
export declare class CreateProjectCommand<T> implements CommandModule<T, CreateProjectArgs> {
    command: string;
    describe: string;
    builder: (args: Argv<T>) => Promise<Argv<CreateProjectArgs>>;
    /**
     * @inheritDoc
     */
    handler(args: ArgumentsCamelCase<CreateProjectArgs>): Promise<void>;
}
export {};
//# sourceMappingURL=CreateProjectCommand.d.ts.map