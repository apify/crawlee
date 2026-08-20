import { SeverityNumber } from '@opentelemetry/api-logs';

import { apifyLogLevelMap, apifyLogLevelNameMap, loggerMethods } from '../src/constants';

/**
 * The mapping itself is a decision worth pinning down - `SOFT_FAIL` and `WARNING` collapse onto one OpenTelemetry
 * severity, and `PERF` has no counterpart at all and is reported as `DEBUG`.
 */
describe('Crawlee log levels', () => {
    test.each([
        [1, 'ERROR', SeverityNumber.ERROR],
        [2, 'SOFT_FAIL', SeverityNumber.WARN],
        [3, 'WARNING', SeverityNumber.WARN],
        [4, 'INFO', SeverityNumber.INFO],
        [5, 'DEBUG', SeverityNumber.DEBUG],
        [6, 'PERF', SeverityNumber.DEBUG],
    ])('level %i (%s) is reported as severity %i', (level, name, severity) => {
        expect(apifyLogLevelMap[level as number]).toBe(severity);
        expect(apifyLogLevelNameMap[level as number]).toBe(name);
    });

    test('OFF has no severity, since nothing is ever logged at it', () => {
        expect(apifyLogLevelMap[0]).toBeUndefined();
        expect(apifyLogLevelNameMap[0]).toBeUndefined();
    });

    test('every instrumented logging method has a level that maps to a severity', () => {
        for (const method of loggerMethods) {
            expect(apifyLogLevelMap[method.level], `${method.methodName} has no severity`).toBeDefined();
            expect(apifyLogLevelNameMap[method.level], `${method.methodName} has no severity text`).toBeDefined();
        }
    });
});
