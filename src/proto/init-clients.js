import { createCrawlerClient } from "./grpc-client";

// start the gRPC clients
export const startClientsGRPC = async () => {
    return new Promise(async (resolve) => {
        setTimeout(async () => {
            try {
                await createCrawlerClient();
            } catch (e) {
                console.error(e);
            }

            resolve(true);
        }, 10);
    });
};
