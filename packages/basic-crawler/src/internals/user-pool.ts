export abstract class ResourceOwner<ResourceType> {
    public id: string = '';
    public abstract runTask<T, TaskReturnType extends Promise<T> | T>(
        task: (resource: ResourceType) => TaskReturnType,
    ): Promise<T>;
    public abstract isIdle(): boolean;
}

export class UserPool<ResourceType> {
    constructor(private users: ResourceOwner<ResourceType>[] = []) {}

    public getUser(filter?: { id?: string }): ResourceOwner<ResourceType> | undefined {
        if (filter?.id) {
            return this.users.find((user) => user.id === filter.id && user.isIdle());
        }
        return this.users.find((user) => user.isIdle());
    }

    public hasIdleUsers(): boolean {
        return this.users.some((user) => user.isIdle());
    }
}
