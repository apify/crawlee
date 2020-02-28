export function serializeArray(data: any[]): Promise<Buffer>;
export function deserializeArray(compressedData: Buffer): Promise<any[]>;
export function createDeserialize(compressedData: any): stream.Readable;
import * as stream from  "stream";
