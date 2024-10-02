import os from 'os';

import type { Statistics } from './crawlers/statistics';
import type { Log } from './log';
import { log as defaultLog } from './log';

export class Monitor {
    private log: Log;
    private statistics: Statistics;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(statistics: Statistics, log: Log = defaultLog) {
        this.statistics = statistics;
        this.log = log.child({ prefix: 'Monitor' });
    }

    start(interval: number = 5000) {
        this.intervalId = setInterval(() => {
            this.display();
        }, interval);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private display() {
        const stats = this.statistics.calculate();
        const now = new Date();
        const startTime = this.statistics.state.crawlerStartedAt;
        const elapsedTime = now.getTime() - new Date(startTime!).getTime();
        const cpuLoad = os.loadavg()[0];
        const memLoad = (os.totalmem() - os.freemem()) / os.totalmem();

        this.log.info(`
Start: ${startTime}
Now: ${now} (running for ${elapsedTime / 1000}s)
Progress: ${this.statistics.state.requestsFinished} / ${stats.requestsTotal} (${
            (this.statistics.state.requestsFinished / stats.requestsTotal) * 100
        }%), failed: ${this.statistics.state.requestsFailed} (${
            (this.statistics.state.requestsFailed / stats.requestsTotal) * 100
        }%)
Remaining: ${this.estimateRemainingTime(stats)} (${stats.requestsFinishedPerMinute} req/min)
Sys. load: ${cpuLoad.toFixed(2)} / ${(memLoad * 100).toFixed(2)}%
Concurrencies: ${this.statistics.state.requestsRetries}
`);
    }

    private estimateRemainingTime(stats: ReturnType<Statistics['calculate']>) {
        const remainingRequests = stats.requestsTotal - this.statistics.state.requestsFinished;
        const avgDuration = stats.requestAvgFinishedDurationMillis;
        return (remainingRequests * avgDuration) / 1000;
    }
}
