/* eslint-disable @typescript-eslint/ban-types */

/** @ignore */
export function entries<T extends {}>(obj: T) {
    return Object.entries(obj) as [keyof T, T[keyof T]][];
}

/** @ignore */
export function keys<T extends {}>(obj: T) {
    return Object.keys(obj) as (keyof T)[];
}
