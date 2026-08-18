import { inspect } from 'node:util';
import { ErrorSnapshotter } from './error_snapshotter.js';
const extractPathFromStackTraceLine = (line) => {
    const lastStartingRoundBracketIndex = line.lastIndexOf('(');
    if (lastStartingRoundBracketIndex !== -1) {
        const closingRoundBracketIndex = line.indexOf(')', lastStartingRoundBracketIndex);
        if (closingRoundBracketIndex !== -1) {
            return line.slice(lastStartingRoundBracketIndex + 1, closingRoundBracketIndex);
        }
    }
    return line;
};
// https://v8.dev/docs/stack-trace-api#appendix%3A-stack-trace-format
const getPathFromStackTrace = (stack) => {
    for (const line of stack) {
        const path = extractPathFromStackTraceLine(line);
        if (path.startsWith('node:') || path.includes('/node_modules/') || path.includes('\\node_modules\\')) {
            continue;
        }
        return path;
    }
    return extractPathFromStackTraceLine(stack[0]);
};
const getStackTraceGroup = (error, storage, showFullStack) => {
    const stack = error.stack?.split('\n').map((line) => line.trim());
    let sliceAt = -1;
    if (stack) {
        for (let i = 0; i < stack.length; i++) {
            if (stack[i].startsWith('at ') || stack[i].startsWith('eval at ')) {
                sliceAt = i;
                break;
            }
        }
    }
    let normalizedStackTrace = null;
    if (sliceAt !== -1) {
        normalizedStackTrace = showFullStack
            ? stack
                .slice(sliceAt)
                .map((x) => x.trim())
                .join('\n')
            : getPathFromStackTrace(stack.slice(sliceAt));
    }
    if (!normalizedStackTrace) {
        normalizedStackTrace = 'missing stack trace';
    }
    if (!(normalizedStackTrace in storage)) {
        storage[normalizedStackTrace] = Object.create(null);
    }
    return storage[normalizedStackTrace];
};
const getErrorCodeGroup = (error, storage) => {
    let { code } = error;
    if (code === undefined) {
        code = 'missing error code';
    }
    if (!(code in storage)) {
        storage[code] = Object.create(null);
    }
    return storage[String(code)];
};
const getErrorNameGroup = (error, storage) => {
    const { name } = error;
    if (!(name in storage)) {
        storage[name] = Object.create(null);
    }
    return storage[name];
};
const findBiggestWordIntersection = (a, b) => {
    let maxStreak = 0;
    let bStreakIndex = -1;
    let aStreakIndex = -1;
    for (let aIndex = 0; aIndex < a.length; aIndex++) {
        let bIndex = -1;
        do {
            let aWalkIndex = aIndex;
            bIndex = b.indexOf(a[aIndex], bIndex + 1);
            let bWalkIndex = bIndex;
            let streak = 0;
            while (aWalkIndex < a.length && bWalkIndex < b.length && b[bWalkIndex++] === a[aWalkIndex++]) {
                streak++;
            }
            if (streak > maxStreak) {
                maxStreak = streak;
                aStreakIndex = aIndex;
                bStreakIndex = bIndex;
            }
        } while (bIndex !== -1);
    }
    return {
        maxStreak,
        aStreakIndex,
        bStreakIndex,
    };
};
const arrayCount = (array, target) => {
    let result = 0;
    for (const item of array) {
        if (item === target) {
            result++;
        }
    }
    return result;
};
const calculatePlaceholder = (a, b) => {
    const { maxStreak, aStreakIndex, bStreakIndex } = findBiggestWordIntersection(a, b);
    if (maxStreak === 0) {
        return ['_'];
    }
    const leftA = a.slice(0, aStreakIndex);
    const leftB = b.slice(0, bStreakIndex);
    const rightA = a.slice(aStreakIndex + maxStreak);
    const rightB = b.slice(bStreakIndex + maxStreak);
    const output = [];
    if (leftA.length !== 0 || leftB.length !== 0) {
        output.push(...calculatePlaceholder(leftA, leftB));
    }
    output.push(...a.slice(aStreakIndex, aStreakIndex + maxStreak));
    if (rightA.length !== 0 || rightB.length !== 0) {
        output.push(...calculatePlaceholder(rightA, rightB));
    }
    return output;
};
const normalizedCalculatePlaceholder = (a, b) => {
    const output = calculatePlaceholder(a, b);
    // We can't be too general
    if (arrayCount(output, '_') / output.length >= 0.5) {
        return ['_'];
    }
    return output;
};
// Merge A (missing placeholders) into B (can contain placeholders but does not have to)
const mergeMessages = (a, b, storage) => {
    const placeholder = normalizedCalculatePlaceholder(a.split(' '), b.split(' ')).join(' ');
    if (placeholder === '_') {
        return undefined;
    }
    const count = storage[a].count + storage[b].count;
    delete storage[a];
    delete storage[b];
    storage[placeholder] = Object.assign(Object.create(null), {
        count,
    });
    return placeholder;
};
const getErrorMessageGroup = (error, storage, showFullMessage) => {
    let { message } = error;
    if (!message) {
        try {
            message =
                typeof error === 'string'
                    ? error
                    : `Unknown error message. Received non-error object: ${JSON.stringify(error)}`;
        }
        catch {
            message = `Unknown error message. Received non-error object, and could not stringify it: ${inspect(error, {
                depth: 0,
            })}`;
        }
    }
    if (!showFullMessage) {
        const newLineIndex = message.indexOf('\n');
        message = message.slice(0, newLineIndex === -1 ? undefined : newLineIndex);
    }
    if (!(message in storage)) {
        storage[message] = Object.assign(Object.create(null), {
            count: 0,
        });
        // This actually safe, since we Object.create(null) so no prototype pollution can happen.
        // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const existingMessage in storage) {
            const newMessage = mergeMessages(message, existingMessage, storage);
            if (newMessage) {
                message = newMessage;
                break;
            }
        }
    }
    return storage[message];
};
const increaseCount = (group) => {
    if (!('count' in group)) {
        // In case users don't want to display error message
        group.count = 0;
    }
    group.count++;
};
/**
 * This class tracks errors and computes a summary of information like:
 * - where the errors happened
 * - what the error names are
 * - what the error codes are
 * - what is the general error message
 *
 * This is extremely useful when there are dynamic error messages, such as argument validation.
 *
 * Since the structure of the `tracker.result` object differs when using different options,
 * it's typed as `Record<string, unknown>`. The most deep object has a `count` property, which is a number.
 *
 * It's possible to get the total amount of errors via the `tracker.total` property.
 */
export class ErrorTracker {
    #options;
    result;
    total;
    errorSnapshotter;
    constructor(options = {}) {
        this.#options = {
            showErrorCode: true,
            showErrorName: true,
            showStackTrace: true,
            showFullStack: false,
            showErrorMessage: true,
            showFullMessage: false,
            saveErrorSnapshots: false,
            ...options,
        };
        if (this.#options.saveErrorSnapshots) {
            this.errorSnapshotter = new ErrorSnapshotter();
        }
        this.result = Object.create(null);
        this.total = 0;
    }
    updateGroup(error) {
        let group = this.result;
        if (this.#options.showStackTrace) {
            group = getStackTraceGroup(error, group, this.#options.showFullStack);
        }
        if (this.#options.showErrorCode) {
            group = getErrorCodeGroup(error, group);
        }
        if (this.#options.showErrorName) {
            group = getErrorNameGroup(error, group);
        }
        if (this.#options.showErrorMessage) {
            group = getErrorMessageGroup(error, group, this.#options.showFullMessage);
        }
        increaseCount(group);
        return group;
    }
    add(error) {
        this.total++;
        this.updateGroup(error);
        if (typeof error.cause === 'object' && error.cause !== null) {
            this.add(error.cause);
        }
    }
    /**
     * This method is async, because it captures a snapshot of the error context.
     * We added this new method to avoid breaking changes.
     */
    async addAsync(error, context) {
        this.total++;
        const group = this.updateGroup(error);
        // Capture a snapshot (screenshot and HTML) on the first occurrence of an error
        if (group.count === 1 && context) {
            await this.captureSnapshot(group, error, context).catch(() => { });
        }
        if (typeof error.cause === 'object' && error.cause !== null) {
            await this.addAsync(error.cause);
        }
    }
    getUniqueErrorCount() {
        let count = 0;
        const goDeeper = (group) => {
            if ('count' in group) {
                count++;
                return;
            }
            // eslint-disable-next-line guard-for-in, no-restricted-syntax
            for (const key in group) {
                goDeeper(group[key]);
            }
        };
        goDeeper(this.result);
        return count;
    }
    getMostPopularErrors(count) {
        const result = [];
        const goDeeper = (group, path) => {
            if ('count' in group) {
                result.push([group.count, path]);
                return;
            }
            // eslint-disable-next-line guard-for-in, no-restricted-syntax
            for (const key in group) {
                goDeeper(group[key], [...path, key]);
            }
        };
        goDeeper(this.result, []);
        return result.sort((a, b) => b[0] - a[0]).slice(0, count);
    }
    async captureSnapshot(storage, error, context) {
        if (!this.errorSnapshotter) {
            return;
        }
        const { screenshotFileUrl, htmlFileUrl } = await this.errorSnapshotter.captureSnapshot(error, context);
        storage.firstErrorScreenshotUrl = screenshotFileUrl;
        storage.firstErrorHtmlUrl = htmlFileUrl;
    }
    reset() {
        // This actually safe, since we Object.create(null) so no prototype pollution can happen.
        // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const key in this.result) {
            delete this.result[key];
        }
    }
}
