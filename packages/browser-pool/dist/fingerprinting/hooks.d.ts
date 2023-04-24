import type { FingerprintInjector } from 'fingerprint-injector';
import type { BrowserPool } from '..';
import type { BrowserController } from '../abstract-classes/browser-controller';
import type { LaunchContext } from '../launch-context';
/**
 * @internal
 */
export declare function createFingerprintPreLaunchHook(browserPool: BrowserPool<any, any, any, any, any>): (_pageId: string, launchContext: LaunchContext) => void;
/**
 * @internal
 */
export declare function createPrePageCreateHook(): (_pageId: string, browserController: BrowserController, pageOptions: any) => void;
/**
 * @internal
 */
export declare function createPostPageCreateHook(fingerprintInjector: FingerprintInjector): (page: any, browserController: BrowserController) => Promise<void>;
//# sourceMappingURL=hooks.d.ts.map