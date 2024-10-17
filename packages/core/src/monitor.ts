import os from 'os';

import type { AutoscaledPool, RequestProvider, Statistics } from '.';

export class Monitor {
    private statistics: Statistics;
    private autoscaledPool: AutoscaledPool | undefined;
    private requestQueue: RequestProvider | undefined;

    private intervalId: NodeJS.Timeout | null = null;
    private monitorDisplay: MonitorDisplay | null = null;

    constructor(
        statistics: Statistics,
        autoscaledPool: AutoscaledPool | undefined,
        requestQueue: RequestProvider | undefined,
    ) {
        this.statistics = statistics;
        this.autoscaledPool = autoscaledPool;
        this.requestQueue = requestQueue;
    }

    start(interval: number = 500) {
        if (!this.monitorDisplay) {
            this.monitorDisplay = new MonitorDisplay();
        }

        this.intervalId = setInterval(async () => {
            await this.display();
        }, interval);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private async display() {
        const stats = this.statistics.calculate();
        const now = new Date();
        const startTime = this.statistics.state.crawlerStartedAt;
        const elapsedTime = now.getTime() - new Date(startTime!).getTime();
        const cpuLoad = os.loadavg()[0];
        const memLoad = (os.totalmem() - os.freemem()) / os.totalmem();
        const { requestsFinished } = this.statistics.state;
        const assumedTotalCount = this.requestQueue?.assumedTotalCount ?? 0;

        if (!this.monitorDisplay) {
            throw new Error('Start the monitor first');
        }

        this.monitorDisplay.log(`Start: ${startTime ? formatDateTime(new Date(startTime)) : undefined}`);
        this.monitorDisplay.log(`Now: ${formatDateTime(now)} (running for ${elapsedTime / 1000}s)`);
        this.monitorDisplay.log(
            `Progress: ${requestsFinished} / ${assumedTotalCount} (${((requestsFinished / assumedTotalCount) * 100).toFixed(2)}%), failed: ${this.statistics.state.requestsFailed} (${((this.statistics.state.requestsFailed / assumedTotalCount) * 100).toFixed(2)}%)`,
        );
        this.monitorDisplay.log(
            `Remaining: ${this.estimateRemainingTime(stats)} seconds (${(stats.requestsFinishedPerMinute / 60).toFixed(2)} pages/seconds)`,
        );
        this.monitorDisplay.log(`Sys. load: ${cpuLoad.toFixed(2)}% CPU / ${(memLoad * 100).toFixed(2)}% Memory`);
        this.monitorDisplay.log(
            `Concurrencies: Current ${this.autoscaledPool?.currentConcurrency}, Desired ${this.autoscaledPool?.desiredConcurrency}`,
        );

        // TODO: Add list of URLs that are currently being processed

        this.monitorDisplay.resetCursor();
    }

    private estimateRemainingTime(stats: ReturnType<Statistics['calculate']>) {
        const na = 'N/A';
        if (!this.requestQueue) {
            return na;
        }

        const remainingRequests = this.requestQueue.assumedTotalCount - this.statistics.state.requestsFinished;
        const avgDuration = stats.requestAvgFinishedDurationMillis;
        const remainingTime = (remainingRequests * avgDuration) / 1000;
        const safeRemainingTime = Number.isFinite(remainingTime) ? remainingTime.toFixed(2) : na;
        return safeRemainingTime;
    }
}

const CLEAR_LINE = '\x1B[K';

class MonitorDisplay {
    private lastLinesCount: number = 0;
    private linesCount: number = 0;

    public log(str: string): void {
        // We create an empty line at the start so that any console.log calls
        // from within the script are above our output.
        if (this.linesCount === 0) {
            // eslint-disable-next-line no-console
            console.log(CLEAR_LINE); // erases the current line
            this.linesCount += 1;
        }

        // Strip lines that are too long
        // const strToLog = str.substring(0, 78);
        const strToLog = str;
        // eslint-disable-next-line no-console
        console.log(`${CLEAR_LINE}${strToLog}`);
        this.linesCount += 1;
    }

    public resetCursor(): void {
        // move cursor up to draw over out output
        process.stdout.write(`\x1B[${this.linesCount}A`);
        this.lastLinesCount = this.linesCount;
        this.linesCount = 0;
    }

    public close(): void {
        // move cursor down so that console output stays
        process.stdout.write(`\x1B[${this.lastLinesCount}B`);
    }
}

function formatDateTime(datetime: Date | number): string {
    const date = typeof datetime === 'number' ? new Date(datetime) : datetime;

    const dateStr = `${date.getFullYear()}-${padDate(date.getMonth() + 1, 2)}-${padDate(date.getDate(), 2)}`;
    const timeStr =
        `${padDate(date.getHours(), 2)}` +
        `:${padDate(date.getMinutes(), 2)}` +
        `:${padDate(date.getSeconds(), 2)}` +
        `.${padDate(date.getMilliseconds(), 3)}`;

    return `${dateStr} ${timeStr}`;
}

function padDate(value: number | string, num: number): string {
    const str = value.toString();
    if (str.length >= num) {
        return str;
    }
    const zeroesToAdd = num - str.length;
    return '0'.repeat(zeroesToAdd) + str;
}
