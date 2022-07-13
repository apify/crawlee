import type { Application } from 'express';
import type { Server } from 'http';

export const startExpressAppPromise = (app: Application, port: number) => {
    return new Promise<Server>((resolve) => {
        const server = app.listen(port, () => resolve(server));
    });
};
