const Apify = require('../build');

Apify.main(async () => {
    let counter = 0;

    // Worker function gets executed again and again in the pool.
    // Size of the pool is auto-scaled based on memory and CPU.
    // If this function returns null then all tasks are considered
    // to be done.
    const workerFunction = () => {
        const current = counter++;

        if (current >= 1000) return null;

        const randomWaitMillis = Math.round(Math.random() * 100);

        return new Promise((resolve) => {
            setTimeout(() => {
                console.log(`${counter} is done!`);
                resolve();
            }, randomWaitMillis);
        });
    };

    const pool = new Apify.AutoscaledPool({
        minConcurrency: 3,
        maxConcurrency: 50,
        workerFunction,
    });

    await pool.run();
});
