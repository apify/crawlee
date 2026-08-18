/**
 * Returns a `Promise` that resolves to true if the code is running in a Docker container.
 */
export declare function isDocker(forceReset?: boolean): Promise<boolean>;
/**
 * Detects if crawlee is running in a containerized environment.
 */
export declare function isContainerized(): Promise<boolean>;
export declare function isLambda(): boolean;
/**
 * gets the cgroup version by checking for a file at /sys/fs/cgroup/memory
 * @returns "V1" or "V2" for the version of cgroup or null if cgroup is not found.
 */
export declare function getCgroupsVersion(forceReset?: boolean): Promise<"V1" | "V2" | null>;
