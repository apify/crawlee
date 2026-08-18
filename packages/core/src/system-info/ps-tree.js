import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
/**
 * Returns a promise that resolves with an array of ProcessInfo objects representing
 * the children of the given PID.
 *
 * @param pid - The PID (number or string) for which to list child processes.
 * @param includeRoot - Optional flag. When true, include the process with the given PID if found.
 *                      Defaults to false.
 * @internal
 */
export async function psTree(pid, includeRoot = false) {
    return new Promise((resolve, reject) => {
        if (typeof pid === 'number') {
            pid = pid.toString();
        }
        let processLister;
        if (process.platform === 'win32') {
            processLister = spawn('powershell', [
                '-NoProfile',
                '-Command',
                'Get-CimInstance Win32_Process | Format-Table ProcessId,ParentProcessId,WorkingSetSize,Name',
            ]);
        }
        else {
            processLister = spawn('ps', ['-A', '-o', 'ppid,pid,stat,rss,comm']);
        }
        processLister.on('error', reject);
        if (!processLister.stdout) {
            reject(new Error('Child process stdout is null'));
            return;
        }
        // Create a readline interface to process stdout line-by-line.
        const rl = readline.createInterface({
            input: processLister.stdout,
        });
        const rows = [];
        let headers = null;
        rl.on('line', (line) => {
            const trimmed = line.trim();
            if (trimmed === '') {
                return; // Skip empty lines.
            }
            // When headers have been set, skip a dashed separator line.
            const fields = trimmed.split(/\s+/);
            if (headers !== null && fields.every((field) => /^-+$/.test(field))) {
                return;
            }
            // The first nonempty line is assumed to be the header row.
            if (!headers) {
                headers = fields.map(normalizeHeader);
                return;
            }
            // Copy the fields into an array to process.
            const columns = fields.slice();
            // Build the process row object.
            const row = {};
            const hdrs = headers.slice();
            // For all headers except the last one, assign one column per header.
            // The last header gets all remaining columns joined (in case the command name contains spaces).
            for (const [index, header] of hdrs.entries()) {
                let value;
                if (index === hdrs.length - 1) {
                    value = columns.join(' ');
                }
                else {
                    value = columns.shift();
                }
                if (header === 'RSS') {
                    row[header] = Number.parseInt(value, 10);
                    if (process.platform !== 'win32') {
                        // On Unix like systems, convert RSS (in KB) to bytes.
                        row[header] *= 1024;
                    }
                }
                else {
                    row[header] = value;
                }
            }
            // On Windows, add STAT with a null value for compatibility.
            if (process.platform === 'win32') {
                row.STAT = null;
            }
            rows.push(row);
        });
        rl.on('close', () => {
            const parents = {};
            const children = [];
            // Seed with the provided PID.
            parents[pid] = true;
            // Build the list of child processes.
            rows.forEach((proc) => {
                // Skip the 'ps' or 'powershell' commands used by psTree to query the processes
                if (proc.COMMAND === 'ps' || proc.COMMAND === 'powershell.exe') {
                    return;
                }
                if (parents[proc.PPID]) {
                    parents[proc.PID] = true;
                    children.push(proc);
                }
                else if (includeRoot && pid === proc.PID) {
                    children.push(proc);
                }
            });
            resolve(children);
        });
        // Also listen for errors on the stdout stream.
        processLister.stdout.on('error', reject);
    });
}
/**
 * Normalizes the header names so that the rest of the code can work uniformly.
 *
 * On non‑Windows systems, we only adjust "COMM" to "COMMAND" (e.g. on macOS).
 * On Windows, the headers from Get-CimInstance + Format-Table are:
 *
 *    ProcessId, ParentProcessId, WorkingSetSize, Name
 *
 * which are mapped to:
 *
 *    PID, PPID, RSS, COMMAND
 */
function normalizeHeader(str) {
    if (process.platform !== 'win32') {
        // macOS may output "COMM" instead of "COMMAND"
        if (str === 'COMM')
            return 'COMMAND';
        return str;
    }
    switch (str) {
        case 'Name':
            return 'COMMAND';
        case 'ParentProcessId':
            return 'PPID';
        case 'ProcessId':
            return 'PID';
        case 'Status':
            return 'STAT';
        case 'WorkingSetSize':
            return 'RSS';
        default:
            throw new Error(`Unknown process listing header: ${str}`);
    }
}
