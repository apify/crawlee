import { Server, ServerCredentials } from "@grpc/grpc-js";
import { crawlTrackingEmitter, establishCrawlTracking } from "./events";
import { loadProto } from "./website";

let server;
const GRPC_HOST = process.env.GRPC_HOST || `0.0.0.0:50051`;

// start the gRPC server and event tracker
export const createServer = async () => {
    await import("@a11ywatch/crawler");
    establishCrawlTracking();
    const websiteProto = await loadProto();
    server = new Server();

    // rust protobuff needs package defs
    server.addService(websiteProto["website.WebsiteService"], {
        // track when a crawl commence
        scanStart: async (call, callback) => {
            crawlTrackingEmitter.emit("crawl-start", call.request);

            callback(null, {});
        },
        // track when a crawl ends
        scanEnd: async (call, callback) => {
            crawlTrackingEmitter.emit("crawl-complete", call.request);

            callback(null, {});
        },
        // scan website for issues that pushes task into queues.
        scanStream: async (call) => {
            call.write({});
            call.end();

            // get the pages returned.
            console.log(call.request.pages[0]);

            crawlTrackingEmitter.emit("crawl-processing", call.request);
        },
    });

    server.bindAsync(GRPC_HOST, ServerCredentials.createInsecure(), () => {
        server.start();
        console.log("gRPC server running at http://0.0.0.0:50051");
    });
};

// stop the gRPC server and clients
export const killServer = async () => {
    const websiteProto = await loadProto();
    if (server) {
        server.removeService(websiteProto["website.WebsiteService"]);
        server.forceShutdown();
    }
};
