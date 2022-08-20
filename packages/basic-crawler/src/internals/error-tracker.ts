interface ErrnoException extends Error {
    errno?: number | undefined;
    code?: string | undefined;
    path?: string | undefined;
    syscall?: string | undefined;
}

export type ErrorTracker = ReturnType<typeof createErrorTracker>;

export const createErrorTracker = ({
    showErrorCode = true,
    showErrorName = true,
    showStackTrace = true,
    showFullStack = false,
    showErrorMessage = true,
} = {}) => {
    const result: Record<string, unknown> = Object.create(null);

    const extractPathFromStackTraceLine = (line: string) => {
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
    const getPathFromStackTrace = (stack: string[]) => {
        for (const line of stack) {
            const path = extractPathFromStackTraceLine(line);

            if (
                path.startsWith('node:')
                || path.includes('/node_modules/')
                || path.includes('\\node_modules\\')
            ) {
                continue;
            }

            return path;
        }

        return extractPathFromStackTraceLine(stack[0]);
    };

    const getStackTraceGroup = (error: ErrnoException, storage: Record<string, unknown>) => {
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
            normalizedStackTrace = showFullStack ? stack!.slice(sliceAt).map((x) => x.trim()).join('\n') : getPathFromStackTrace(stack!.slice(sliceAt));
        }

        if (!normalizedStackTrace) {
            normalizedStackTrace = 'null';
        }

        if (!(normalizedStackTrace in storage)) {
            storage[normalizedStackTrace] = Object.create(null);
        }

        return storage[normalizedStackTrace] as Record<string, unknown>;
    };

    const getErrorCodeGroup = (error: ErrnoException, storage: Record<string, unknown>) => {
        let { code } = error;

        if (code === undefined) {
            code = 'null';
        }

        if (!(code in storage)) {
            storage[code] = Object.create(null);
        }

        return storage[code] as Record<string, unknown>;
    };

    const getErrorNameGroup = (error: ErrnoException, storage: Record<string, unknown>) => {
        const { name } = error;

        if (!(name in storage)) {
            storage[name] = {};
        }

        return storage[name] as Record<string, unknown>;
    };

    // A is the current one, B may already contain placeholders
    // This is just a precondition
    const isSimilarMessage = (a: string, b: string) => {
        if (a === b) {
            return true;
        }

        const aParts = a.split(' ');
        const bParts = b.split(' ');

        // Usually the first word is the same
        // if (aParts[0] !== bParts[0]) {
        //     return false;
        // }

        // Insufficient words to compare
        if (aParts.length < 3 || bParts.length < 3) {
            return false;
        }

        // Check if A includes B
        {
            let bInA = 0;
            for (const part of bParts) {
                if (aParts.includes(part)) {
                    bInA++;
                }
            }

            // if (bInA <= bParts.length - 2) { // Safer
            if ((bInA / bParts.length) > 0.5) { // More lenient
                return true;
            }
        }

        // Check if B includes A
        {
            let aInB = 0;

            for (const part of aParts) {
                if (bParts.includes(part)) {
                    aInB++;
                }
            }

            // if (aInB <= aParts.length - 2) { // Safer
            if ((aInB / aParts.length) > 0.5) { // More lenient
                return true;
            }
        }

        return false;
    };

    const findBiggestWordIntersection = (a: string[], b: string[]) => {
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

    const calculatePlaceholder = (a: string[], b: string[]) => {
        const { maxStreak, aStreakIndex, bStreakIndex } = findBiggestWordIntersection(a, b);

        if (maxStreak === 0) {
            return ['_'];
        }

        const leftA = a.slice(0, aStreakIndex);
        const leftB = b.slice(0, bStreakIndex);
        const rightA = a.slice(aStreakIndex + maxStreak);
        const rightB = b.slice(bStreakIndex + maxStreak);

        const output: string[] = [];

        if (leftA.length !== 0 || leftB.length !== 0) {
            output.push(...calculatePlaceholder(leftA, leftB));
        }

        output.push(...a.slice(aStreakIndex, aStreakIndex + maxStreak));

        if (rightA.length !== 0 || rightB.length !== 0) {
            output.push(...calculatePlaceholder(rightA, rightB));
        }

        return output;
    };

    // Merge A (missing placeholders) into B (can contain placeholders but does not have to)
    const mergeMessages = (a: string, b: string, storage: Record<string, unknown>) => {
        const placeholder = calculatePlaceholder(
            a.split(' '),
            b.split(' '),
        ).join(' ');

        if (placeholder === '_') {
            return undefined;
        }

        interface HasCount {
            count: number;
        }

        const count = (storage[a] as HasCount).count + (storage[b] as HasCount).count;

        delete storage[a];
        delete storage[b];

        storage[placeholder] = {
            count,
        };

        return placeholder;
    };

    const getErrorMessageGroup = (error: ErrnoException, storage: Record<string, unknown>) => {
        let { message } = error;

        if (!(message in storage)) {
            storage[message] = {
                count: 0,
            };

            for (const existingMessage of Object.keys(storage)) {
                if (isSimilarMessage(message, existingMessage)) {
                    const newMessage = mergeMessages(message, existingMessage, storage);
                    if (newMessage) {
                        message = newMessage;
                        break;
                    }
                }
            }
        }

        return storage[message] as Record<string, unknown>;
    };

    const increaseCount = (group: { count: number }) => {
        if (!('count' in group)) {
            // In case users don't want to display error message
            group.count = 0;
        }

        group.count++;
    };

    let total = 0;

    return {
        add(error: ErrnoException) {
            total++;

            let group = result;

            if (showStackTrace) {
                group = getStackTraceGroup(error, group);
            }

            if (showErrorCode) {
                group = getErrorCodeGroup(error, group);
            }

            if (showErrorName) {
                group = getErrorNameGroup(error, group);
            }

            if (showErrorMessage) {
                group = getErrorMessageGroup(error, group);
            }

            increaseCount(group as { count: number });
        },
        get total() {
            return total;
        },
        result,
    };
};
