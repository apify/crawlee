import type { SessionFingerprint } from '@crawlee/types';

/**
 * (browser, platform, device) combinations that correspond to setups people
 * actually run. Anything not listed here (e.g. `edge` on android, `safari` on
 * windows, `desktop` mobile platforms) is left out so a randomized default
 * never produces a fingerprint that would itself be a giveaway.
 */
const PROFILES_BY_PLATFORM: Record<
    NonNullable<SessionFingerprint['platform']>,
    Required<Pick<SessionFingerprint, 'browser' | 'platform' | 'device'>>[]
> = {
    windows: [
        { browser: 'chrome', platform: 'windows', device: 'desktop' },
        { browser: 'firefox', platform: 'windows', device: 'desktop' },
        { browser: 'edge', platform: 'windows', device: 'desktop' },
    ],
    macos: [
        { browser: 'chrome', platform: 'macos', device: 'desktop' },
        { browser: 'firefox', platform: 'macos', device: 'desktop' },
        { browser: 'safari', platform: 'macos', device: 'desktop' },
        { browser: 'edge', platform: 'macos', device: 'desktop' },
    ],
    linux: [
        { browser: 'chrome', platform: 'linux', device: 'desktop' },
        { browser: 'firefox', platform: 'linux', device: 'desktop' },
    ],
    android: [
        { browser: 'chrome', platform: 'android', device: 'mobile' },
        { browser: 'firefox', platform: 'android', device: 'mobile' },
    ],
    ios: [{ browser: 'safari', platform: 'ios', device: 'mobile' }],
};

function getHostPlatform(): NonNullable<SessionFingerprint['platform']> {
    switch (process.platform) {
        case 'win32':
            return 'windows';
        case 'darwin':
            return 'macos';
        default:
            return 'linux';
    }
}

/**
 * Build a {@apilink SessionFingerprint} whose `platform` matches the host OS
 * and whose `browser`/`device` are randomized within the realistic profiles for
 * that platform. Used by {@apilink SessionPool} as the default fingerprint for
 * freshly created sessions; callers can override by passing their own
 * `fingerprint` in `sessionOptions`.
 */
export function createDefaultSessionFingerprint(): SessionFingerprint {
    const profiles = PROFILES_BY_PLATFORM[getHostPlatform()];
    return { ...profiles[Math.floor(Math.random() * profiles.length)] };
}
