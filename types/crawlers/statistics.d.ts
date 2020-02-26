/**
 * The statistics class provides an interface to collecting and logging run
 * statistics of arbitrary jobs. Currently it provides the following information:
 *
 *  - Average run time of successful jobs
 *  - Number of successful jobs per minute
 *  - Total number of successful jobs
 *  - Total number of failed jobs
 *  - A histogram of retry counts = Number of jobs that finished after N retries.
 *
 * @ignore
 */
export default class Statistics {
    constructor(options?: {});
    logIntervalMillis: number;
    logMessage: any;
    jobRetryHistogram: any[];
    finishedJobs: number;
    failedJobs: number;
    jobsInProgress: Map<any, any>;
    minJobDurationMillis: number;
    maxJobDurationMillis: number;
    totalJobDurationMillis: number;
    startedAt: Date | null;
    logInterval: NodeJS.Timeout | null;
    startJob(id: any): void;
    finishJob(id: any): void;
    failJob(id: any): void;
    getCurrent(): {
        avgDurationMillis: number;
        perMinute: number;
        finished: number;
        failed: number;
        retryHistogram: any[];
    };
    startLogging(): void;
    stopLogging(): void;
    _saveRetryCountForJob(job: any): void;
}
