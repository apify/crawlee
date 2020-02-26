export function compressData(data: any[]): Promise<Buffer>;
export function decompressData(compressedData: Buffer): Promise<any[]>;
export function createDecompress(compressedData: any): stream.Readable;
import * as stream from  "stream";
