import { weightedAvg } from '../../../packages/core/src/autoscaling/weighted_avg.js';

describe('weightedAvg()', () => {
    test('works', () => {
        expect(weightedAvg([10, 10, 10], [1, 1, 1])).toBe(10);
        expect(weightedAvg([5, 10, 15], [1, 1, 1])).toBe(10);
        expect(weightedAvg([10, 10, 10], [0.5, 1, 1.5])).toBe(10);
        expect(weightedAvg([29, 35, 89], [13, 91, 3])).toEqual((29 * 13 + 35 * 91 + 89 * 3) / (13 + 91 + 3));
        expect(weightedAvg([], [])).toEqual(NaN);
        expect(weightedAvg([1], [0])).toEqual(NaN);
        expect(weightedAvg([], [1])).toEqual(NaN);
    });
});
