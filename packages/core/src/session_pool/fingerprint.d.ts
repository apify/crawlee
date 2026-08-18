import type { SessionFingerprint } from '@crawlee/types';
/**
 * Build a {@apilink SessionFingerprint} whose `platform` matches the host OS
 * and whose `browser`/`device` are randomized within the realistic profiles for
 * that platform. Used by {@apilink SessionPool} as the default fingerprint for
 * freshly created sessions; callers can override by passing their own
 * `fingerprint` in `sessionOptions`.
 */
export declare function createDefaultSessionFingerprint(): SessionFingerprint;
