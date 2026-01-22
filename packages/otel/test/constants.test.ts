import { SeverityNumber } from '@opentelemetry/api-logs';

import { apifyLogLevelMap } from '../src/constants';

describe('apifyLogLevelMap', () => {
    test('maps ERROR level (1) to SeverityNumber.ERROR', () => {
        expect(apifyLogLevelMap[1]).toBe(SeverityNumber.ERROR);
    });

    test('maps SOFT_FAIL level (2) to SeverityNumber.WARN', () => {
        expect(apifyLogLevelMap[2]).toBe(SeverityNumber.WARN);
    });

    test('maps WARNING level (3) to SeverityNumber.WARN', () => {
        expect(apifyLogLevelMap[3]).toBe(SeverityNumber.WARN);
    });

    test('maps INFO level (4) to SeverityNumber.INFO', () => {
        expect(apifyLogLevelMap[4]).toBe(SeverityNumber.INFO);
    });

    test('maps DEBUG level (5) to SeverityNumber.DEBUG', () => {
        expect(apifyLogLevelMap[5]).toBe(SeverityNumber.DEBUG);
    });

    test('maps PERF level (6) to SeverityNumber.DEBUG', () => {
        expect(apifyLogLevelMap[6]).toBe(SeverityNumber.DEBUG);
    });

    test('does not include OFF level (0)', () => {
        expect(apifyLogLevelMap[0]).toBeUndefined();
    });

    test('contains all expected log levels', () => {
        const expectedLevels = [1, 2, 3, 4, 5, 6];
        const actualLevels = Object.keys(apifyLogLevelMap).map(Number);

        expect(actualLevels.sort()).toEqual(expectedLevels.sort());
    });

    test('all mapped values are valid SeverityNumbers', () => {
        const validSeverityNumbers = [
            SeverityNumber.ERROR,
            SeverityNumber.WARN,
            SeverityNumber.INFO,
            SeverityNumber.DEBUG,
        ];

        for (const severityNumber of Object.values(apifyLogLevelMap)) {
            expect(validSeverityNumbers).toContain(severityNumber);
        }
    });
});
