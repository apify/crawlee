export function throwImplementationNeeded(methodName: string): never {
    throw new Error(`You need to implement method ${methodName}.`);
}
