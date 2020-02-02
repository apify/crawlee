import { EventEmitter } from 'events';
import WebSocket from 'ws';
import log from 'apify-shared/log';
import { ENV_VARS, ACTOR_EVENT_NAMES } from 'apify-shared/consts';
import { ACTOR_EVENT_NAMES_EX } from './constants';

// NOTE: This value is mentioned below in docs, if you update it here, update it there too.
const PERSIST_STATE_INTERVAL_MILLIS = 60 * 1000;

/**
 * Event emitter providing events from underlying Actor infrastructure and Apify package.
 * @ignore
 */
const events = new EventEmitter();

/**
 * Websocket connection to actor events.
 * @ignore
 */
let eventsWs = null;

/**
 * Interval that emits persist state events.
 * @ignore
 */
let persistStateInterval = null;

/**
 * Gets an instance of a Node.js'
 * <a href="https://nodejs.org/api/events.html#events_class_eventemitter" target="_blank">EventEmitter</a>
 * class that emits various events from the SDK or the Apify platform.
 * The event emitter is initialized by calling the [`Apify.main()`](#module_Apify.main) function.
 *
 * **Example usage:**
 *
 * ```javascript
 * Apify.events.on('cpuInfo', (data) => {
 *   if (data.isCpuOverloaded) console.log('Oh no, the CPU is overloaded!');
 * });
 * ```
 *
 * The following table shows all currently emitted events:
 * <table>
 *     <thead>
 *         <tr>
 *             <th>Event name</th>
 *             <th>Data</th>
 *     </thead>
 *     <tbody>
 *         <tr>
 *             <td><code>cpuInfo</code></td>
 *             <td><code>{ "isCpuOverloaded": Boolean }</code></td>
 *         </tr>
 *         <tr>
 *             <td colspan="2">
 *                 The event is emitted approximately every second
 *                 and it indicates whether the actor is using the maximum of available CPU resources.
 *                 If that's the case, the actor should not add more workload.
 *                 For example, this event is used by the <a href="autoscaledpool"><code>AutoscaledPool</code></a> class.
 *             </td>
 *         </tr>
 *         <tr>
 *             <td><code>migrating</code></td>
 *             <td>None</td>
 *         </tr>
 *         <tr>
 *             <td colspan="2">
 *                 Emitted when the actor running on the Apify platform is going to be migrated to another worker server soon.
 *                 You can use it to persist the state of the actor and abort the run, to speed up migration.
 *                 For example, this is used by the <a href="requestlist"><code>RequestList</code></a> class.
 *             </td>
 *         </tr>
 *         <tr>
 *             <td><code>persistState</code></td>
 *             <td><code>{ "isMigrating": Boolean }</code></td>
 *         </tr>
 *         <tr>
 *             <td colspan="2">
 *                 Emitted in regular intervals (by default 60 seconds) to notify all components of Apify SDK that it is time to persist
 *                 their state, in order to avoid repeating all work when the actor restarts.
 *                 This event is automatically emitted together with the <code>migrating</code> event,
 *                 in which case the <code>isMigrating</code> flag is set to <code>true</code>. Otherwise the flag is <code>false</code>.
 *                 <br><br>
 *                 Note that the <code>persistState</code> event is provided merely for user convenience,
 *                 you can achieve the same effect using <code>setInterval()</code> and listening for the <code>migrating</code> event.
 *             </td>
 *         </tr>
 *     </tbody>
 * </table>
 *
 * @memberof module:Apify
 * @name events
 */
export default events;

/**
 * Emits event telling all components that they should persist their state at regular intervals and also when an actor is being
 * migrated to another worker.
 *
 * @ignore
 */
const emitPersistStateEvent = (isMigrating = false) => {
    events.emit(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, { isMigrating });
};

/**
 * Initializes `Apify.events` event emitter by creating a connection to a websocket that provides them.
 * This is an internal function that is automatically called by `Apify.main()`.
 *
 * @memberof module:Apify
 * @name initializeEvents
 * @function
 * @ignore
 */
export const initializeEvents = () => {
    if (eventsWs) return;

    if (!persistStateInterval) {
        // This is overridable only to enable unit testing.
        const intervalMillis = process.env.APIFY_TEST_PERSIST_INTERVAL_MILLIS || PERSIST_STATE_INTERVAL_MILLIS;
        persistStateInterval = setInterval(() => emitPersistStateEvent(), intervalMillis);
    }

    const eventsWsUrl = process.env[ENV_VARS.ACTOR_EVENTS_WS_URL];

    // Locally there is no web socket to connect, so just print a log message.
    if (!eventsWsUrl) {
        log.debug(`Apify.events: Environment variable ${ENV_VARS.ACTOR_EVENTS_WS_URL} is not set, no events from Apify platform will be emitted.`);
        return;
    }

    eventsWs = new WebSocket(eventsWsUrl);
    eventsWs.on('message', (message) => {
        if (!message) return;

        try {
            const { name, data } = JSON.parse(message);

            events.emit(name, data);

            if (name === ACTOR_EVENT_NAMES.MIGRATING) {
                clearInterval(persistStateInterval); // Don't send any other persist state event.
                emitPersistStateEvent(true);
            }
        } catch (err) {
            log.exception(err, 'Apify.events: Cannot parse actor event');
        }
    });
    eventsWs.on('error', (err) => {
        // Don't print this error as this happens in the case of very short Apify.main().
        if (err.message === 'WebSocket was closed before the connection was established') return;

        log.exception(err, 'Apify.events: web socket connection failed');
    });
    eventsWs.on('close', () => {
        log.warning('Apify.events: web socket has been closed');
        eventsWs = null;
    });
};

/**
 * Closes websocket providing events from Actor infrastructure and also stops sending internal events
 * of Apify package such as `persistState`.
 * This is automatically called at the end of `Apify.main()`.
 *
 * @memberof module:Apify
 * @name stopEvents
 * @function
 * @ignore
 */
export const stopEvents = () => {
    if (eventsWs) eventsWs.close();
    clearInterval(persistStateInterval);
    persistStateInterval = null;
};
