import { crawlerClient } from "../grpc-client";

// start scan job from crawler and gather links as found
export const crawlerScan = (website = {}) => {
    return new Promise((resolve, reject) => {
        crawlerClient.scan(website, (error, res) => {
            if (!error) {
                resolve(res);
            } else {
                reject(error);
            }
        });
    });
};
