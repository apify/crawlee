export function entries<T extends {}>(obj: T) {
    return Object.entries(obj) as [keyof T, T[keyof T]][];
}
