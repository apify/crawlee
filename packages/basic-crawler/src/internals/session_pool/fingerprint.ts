import type { SessionFingerprint } from '@crawlee/types';

/**
 * (browser, platform, device) combinations that correspond to setups people
 * actually run. Anything not listed here (e.g. `edge` on android, `safari` on
 * windows, `desktop` mobile platforms) is left out so a randomized default
 * never produces a fingerprint that would itself be a giveaway.
 */
const PROFILES_BY_PLATFORM = [
    { browser: 'chrome', platform: 'windows', device: 'desktop' },
    { browser: 'firefox', platform: 'windows', device: 'desktop' },
    { browser: 'edge', platform: 'windows', device: 'desktop' },
    { browser: 'chrome', platform: 'macos', device: 'desktop' },
    { browser: 'firefox', platform: 'macos', device: 'desktop' },
    { browser: 'safari', platform: 'macos', device: 'desktop' },
    { browser: 'edge', platform: 'macos', device: 'desktop' },
    { browser: 'chrome', platform: 'linux', device: 'desktop' },
    { browser: 'firefox', platform: 'linux', device: 'desktop' },
    { browser: 'chrome', platform: 'android', device: 'mobile' },
    { browser: 'firefox', platform: 'android', device: 'mobile' },
    { browser: 'safari', platform: 'ios', device: 'mobile' },
] as const;

/**
 * Build a {@apilink SessionFingerprint} whose `platform` matches the host OS
 * and whose `browser`/`device` are randomized within the realistic profiles for
 * that platform. Used by {@apilink SessionPool} as the default fingerprint for
 * freshly created sessions; callers can override by passing their own
 * `fingerprint` in `sessionOptions`.
 */
export function createDefaultSessionFingerprint(): SessionFingerprint {
    return { ...PROFILES_BY_PLATFORM[Math.floor(Math.random() * PROFILES_BY_PLATFORM.length)] };
}
