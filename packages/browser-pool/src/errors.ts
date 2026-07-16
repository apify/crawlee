import { CriticalError } from '@crawlee/core';

export class BrowserLaunchError extends CriticalError {
    public constructor(...args: ConstructorParameters<typeof CriticalError>) {
        super(...args);
        this.name = 'BrowserLaunchError';

        const [, oldStack] = this.stack?.split('\u200b') ?? [null, ''];

        Object.defineProperty(this, 'stack', {
            get: () => {
                if (this.cause instanceof Error) {
                    return `${this.message}\n${this.cause.stack}\nError thrown at:\n${oldStack}`;
                }

                return `${this.message}\n${oldStack}`;
            },
        });
    }
}
