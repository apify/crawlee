type AttributeValue =
    | string
    | number
    | boolean
    | (null | undefined | string)[]
    | (null | undefined | number)[]
    | (null | undefined | boolean)[];

function isPrimitive(v: unknown): v is string | number | boolean {
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function isValidArray(v: unknown): v is AttributeValue {
    if (!Array.isArray(v)) return false;

    let seenType: 'string' | 'number' | 'boolean' | null = null;

    for (const item of v) {
        if (item === null || item === undefined) continue;

        if (!isPrimitive(item)) return false;

        const t = typeof item;
        if (seenType === null) {
            seenType = t as 'string' | 'number' | 'boolean';
        } else if (seenType !== t) {
            // mixed primitive arrays are NOT allowed by OTEL
            return false;
        }
    }

    return true;
}

export function toOtelAttributeValue(value: unknown): AttributeValue {
    if (isPrimitive(value)) {
        return value;
    }

    if (isValidArray(value)) {
        return value;
    }

    try {
        return JSON.stringify(value) || String(value);
    } catch {
        return String(value);
    }
}
