import log from 'apify-shared/log';
import { betterSetInterval, betterClearInterval } from 'apify-shared/utilities';
import { checkParamOrThrow } from 'apify-client/build/utils';

class Job {
    constructor() {
        this.lastRunAt = null;
        this.runs = 0;
    }

    run() {
        this.lastRunAt = new Date();
        this.runs++;
        return this.runs;
    }

    finish() {
        this.durationMillis = new Date() - this.lastRunAt;
        return this.durationMillis;
    }
}

export default class Statistics {
    constructor(options = {}) {
        const {
            logIntervalSecs = 60,
            logMessage = 'Statistics',
        } = options;

        checkParamOrThrow(logIntervalSecs, 'options.logIntervalSecs', 'Number');
        checkParamOrThrow(logMessage, 'options.logMessage', 'String');

        this.logIntervalMillis = logIntervalSecs * 1000;
        this.logMessage = logMessage;

        this.jobRetryHistogram = [];
        this.finishedJobs = 0;
        this.failedJobs = 0;
        this.jobsInProgress = new Map();
        this.minJobDurationMillis = Infinity;
        this.maxJobDurationMillis = 0;
        this.totalJobDurationMillis = 0;
        this.startedAt = null;
        this.logInterval = null;
    }

    startJob(id) {
        if (!this.startedAt) this.startedAt = new Date();
        let job = this.jobsInProgress.get(id);
        if (!job) job = new Job();
        const retryCount = job.run() - 1;
        this.jobRetryHistogram[retryCount] = this.jobRetryHistogram[retryCount]++ || 1;
        this.jobsInProgress.set(id, job);
    }

    finishJob(id) {
        const job = this.jobsInProgress.get(id);
        if (!job) return;
        const jobDurationMillis = job.finish();
        this.finishedJobs++;
        this.totalJobDurationMillis += jobDurationMillis;
        if (jobDurationMillis < this.minJobDurationMillis) this.minJobDurationMillis = jobDurationMillis;
        if (jobDurationMillis > this.maxJobDurationMillis) this.maxJobDurationMillis = jobDurationMillis;
        this.jobsInProgress.delete(id);
    }

    failJob(id) {
        const job = this.jobsInProgress.get(id);
        if (!job) return;
        this.failedJobs++;
        this.jobsInProgress.delete(id);
    }

    getStatistics() {
        const totalMillis = new Date() - this.startedAt;
        const totalMinutes = totalMillis / 1000 / 60;

        return {
            avgDurationMillis: this.totalJobDurationMillis / this.finishedJobs,
            perMinute: Math.round(this.finishedJobs / totalMinutes),
            finished: this.finishedJobs,
            failed: this.failedJobs,
            retryHistogram: [...this.jobRetryHistogram],
        };
    }

    startLogging() {
        this.logInterval = betterSetInterval(() => {
            log.info(this.logMessage, this.getStatistics());
        }, this.logIntervalMillis);
    }

    stopLogging() {
        betterClearInterval(this.logInterval);
    }
}
