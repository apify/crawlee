export function isStream(value: any): boolean {
    return (
        typeof value === 'object' &&
        value &&
        ['on', 'pipe'].every((key) => key in value && typeof value[key] === 'function')
    );
}
