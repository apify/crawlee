import type { ConcurrencyConsumer, IConcurrencySystem } from 'crawlee';
import { CheerioCrawler } from 'crawlee';

const SLOTS_PER_CRAWLER = 5;

// Task ids repeat across consumers - each pool numbers its own tasks - so the consumer, which is the
// same object on every call it makes, is what keeps their bookings apart.
const inFlight = new Map<ConcurrencyConsumer, Map<string, number>>();

// A governor that hands every crawler the same guaranteed slice, instead of serving whoever asks first.
const fairShare: IConcurrencySystem = {
    desiredConcurrency: SLOTS_PER_CRAWLER,
    isRunning: true,
    get currentConcurrency() {
        return [...inFlight.values()].reduce((total, tasks) => total + tasks.size, 0);
    },
    hasCapacityForTask: (consumer) => (inFlight.get(consumer)?.size ?? 0) < SLOTS_PER_CRAWLER,
    tryRegisterTaskStart(consumer, taskId) {
        const tasks = inFlight.get(consumer) ?? new Map<string, number>();
        inFlight.set(consumer, tasks);

        if (tasks.size >= SLOTS_PER_CRAWLER) {
            return false;
        }

        tasks.set(taskId, Date.now());

        return true;
    },
    registerTaskEnd(consumer, taskId) {
        const tasks = inFlight.get(consumer)!;

        console.log(`${consumer.id} ran task ${taskId} for ${Date.now() - tasks.get(taskId)!} ms`);
        tasks.delete(taskId);
    },
};

const products = new CheerioCrawler({ id: 'products', concurrencySystem: fairShare });
const reviews = new CheerioCrawler({ id: 'reviews', concurrencySystem: fairShare });

await Promise.all([products.run(['https://crawlee.dev']), reviews.run(['https://crawlee.dev'])]);
