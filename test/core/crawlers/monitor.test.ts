import os from 'node:os';

import { Statistics } from '@crawlee/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { Monitor } from '../../../packages/core/src/crawlers/monitor';
import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator';

describe('Monitor', () => {
    const localStorageEmulator = new MemoryStorageEmulator();
    let originalIsTTY: boolean | undefined;

    beforeEach(async () => {
        await localStorageEmulator.init();
        vi.useFakeTimers();
        originalIsTTY = process.stderr.isTTY;
    });

    afterEach(async () => {
        await localStorageEmulator.destroy();
        vi.useRealTimers();
        vi.restoreAllMocks();
        // Restore isTTY — Object.defineProperty mutations are not undone by vi.restoreAllMocks
        Object.defineProperty(process.stderr, 'isTTY', { value: originalIsTTY, configurable: true });
    });

    test('constructs without throwing', () => {
        const stats = new Statistics();
        expect(() => new Monitor(stats)).not.toThrow();
    });

    test('start() and stop() do not throw', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        expect(() => monitor.start()).not.toThrow();
        expect(() => monitor.stop()).not.toThrow();
    });

    test('stop() before start() does not throw', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        expect(() => monitor.stop()).not.toThrow();
    });

    test('buildLines() returns 5 lines', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        const lines = monitor.buildLines();
        expect(lines).toHaveLength(5);
    });

    test('buildLines() shows finished/total and percentage when total is known', () => {
        const stats = new Statistics();
        stats.startJob('r1');
        stats.finishJob('r1', 0);

        const monitor = new Monitor(stats, undefined, {}, () => 10);
        const lines = monitor.buildLines();

        expect(lines[1]).toContain('1/10');
        expect(lines[1]).toContain('10.0%');
    });

    test('buildLines() shows ? when total is unknown', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        const lines = monitor.buildLines();

        expect(lines[1]).toContain('/?');
    });

    test('buildLines() shows ETA as N/A when total is unknown', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        const lines = monitor.buildLines();

        expect(lines[2]).toContain('N/A');
    });

    test('buildLines() shows concurrency info when autoscaledPool is provided', () => {
        const stats = new Statistics();
        const fakePool = {
            currentConcurrency: 3,
            desiredConcurrency: 5,
            maxConcurrency: 10,
        } as any;

        const monitor = new Monitor(stats, fakePool);
        const lines = monitor.buildLines();

        expect(lines[4]).toContain('3/10');
        expect(lines[4]).toContain('desired: 5');
    });

    test('buildLines() shows N/A for concurrency when autoscaledPool is not provided', () => {
        const stats = new Statistics();
        const monitor = new Monitor(stats);
        const lines = monitor.buildLines();

        expect(lines[4]).toContain('N/A');
    });

    test('renders to stderr when interval fires', () => {
        const writeStub = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const stats = new Statistics();
        const monitor = new Monitor(stats, undefined, { intervalSecs: 1 });

        monitor.start();
        vi.advanceTimersByTime(1000);
        monitor.stop();

        expect(writeStub).toHaveBeenCalled();
    });

    test('in non-TTY mode, does not write ANSI overwrite codes', () => {
        const writes: string[] = [];
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
            writes.push(String(chunk));
            return true;
        });
        Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });

        const stats = new Statistics();
        const monitor = new Monitor(stats, undefined, { intervalSecs: 1 });

        monitor.start();
        vi.advanceTimersByTime(1000);
        monitor.stop();

        const combined = writes.join('');
        // Should not contain ANSI cursor-up code
        expect(combined).not.toContain('\x1b[5A');
        expect(combined).not.toContain('\x1b[2K');
    });

    test('in TTY mode, second render writes ANSI cursor-up to overwrite', () => {
        const writes: string[] = [];
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
            writes.push(String(chunk));
            return true;
        });
        Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });

        const stats = new Statistics();
        const monitor = new Monitor(stats, undefined, { intervalSecs: 1 });

        monitor.start();
        vi.advanceTimersByTime(1000); // first render (from start())
        vi.advanceTimersByTime(1000); // second render via interval — should have cursor-up
        monitor.stop();

        const combined = writes.join('');
        expect(combined).toContain('\x1b[5A');
    });
});
