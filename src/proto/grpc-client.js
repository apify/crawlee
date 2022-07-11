import { credentials } from "@grpc/grpc-js";
import { GRPC_HOST_CRAWLER } from "@app/config/rpc";
import { getProto } from "./website";

let crawlerClient;

const GRPC_HOST_CRAWLER = process.env.GRPC_HOST_CRAWLER || `0.0.0.0:50055`;

const createCrawlerClient = async () => {
    try {
        const { crawler } = await getProto("crawler.proto");

        crawlerClient = new crawler.Crawler(
            GRPC_HOST_CRAWLER,
            credentials.createInsecure()
        );
    } catch (e) {
        console.error(e);
    }
};

export const killClient = () => {
    crawlerClient?.close();
};

export { crawlerClient, createCrawlerClient };
