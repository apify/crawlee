import { load } from "@grpc/proto-loader";
import { loadPackageDefinition } from "@grpc/grpc-js";

const protoConfig = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
};

export const loadProto = async (target = "website.proto") => {
    try {
        return await load(
            `node_modules/@a11ywatch/protos/${target}`,
            protoConfig
        );
    } catch (e) {
        console.error(e);
    }
};

export const getProto = async (target = "website.proto") => {
    try {
        const packageDef = await loadProto(target);

        return loadPackageDefinition(packageDef);
    } catch (e) {
        console.error(e);
    }
};
