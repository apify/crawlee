import { access } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

export async function waitTillWrittenToDisk(path: string): Promise<void> {
    try {
        await access(path);
    } catch {
        await setTimeout(50);
        return waitTillWrittenToDisk(path);
    }
}
