export default events;
export function initializeEvents(): void;
export function stopEvents(): void;
/**
 * Event emitter providing events from underlying Actor infrastructure and Apify package.
 * @ignore
 */
declare const events: EventEmitter;
import { EventEmitter } from  "events";
