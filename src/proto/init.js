import { createServer } from "./grpc-server";
import { startClientsGRPC } from "./init-clients";

// start gRPC server and client
export const startGRPC = () => {
    return new Promise(async (resolve) => {
        await createServer();
        await startClientsGRPC();
        resolve(true);
    });
};
