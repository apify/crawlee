import EventEmitter from 'events';
import WebSocket from 'ws';
import log from 'apify-shared/log';
import { ENV_VARS, ACTOR_EVENT_NAMES } from 'apify-shared/consts';
import { ACTOR_EVENT_NAMES_EX } from './constants';

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
 * Gets an instance of Node.js' <a href="https://nodejs.org/api/events.html#events_class_eventemitter">EventEmitter</a> class
 * that emits various events from the SDK or the Apify platform.
 * The event emitter is initialized by calling <a href="#module-Apify-main"><code>Apify.main()</code></a> function.
 *
 * Example usage:
 *
 * ```javascript
 * Apify.main(async () => {
 *   &nbsp;
 *   Apify.events.on('cpuInfo', (data) => {
 *     if (data.isCpuOverloaded) console.log('Oh no, the CPU is overloaded!');
 *   });
 *.  &nbsp;
 * });
 * ```
 *
 * The following table shows all currently emitted events:
 *
 * <table class="table table-bordered table-condensed">
 *     <thead>
 *         <tr>
 *             <th>Event name</th>
 *             <th>Data</th>
 *             <th>Description</th>
 *     </thead>
 *     <tbody>
 *         <tr>
 *             <td>`cpuInfo`</td>
 *             <td>`{ "isCpuOverloaded": Boolean }`</td>
 *             <td>
 *                 The event is emitted approximately every second
 *                 and it indicates whether the actor is using maximum of available CPU resources.
 *                 If that's the case, the actor should not add more workload.
 *                 For example, this event is used by the <a href="#AutoscaledPool">AutoscaledPool</a> class.
 *             </td>
 *         </tr>
 *         <tr>
 *             <td>`migrating`</td>
 *             <td>None</td>
 *             <td>
 *                 Emitted when the actor running on Apify platform is going to be migrated to another worker server soon.
 *                 You can use it to persist the state of the actor and abort the run, to speed up the migration.
 *                 For example, this is used by the <a href="#RequestList">RequestList</a> class.
 *             </td>
 *         </tr>
 *         <tr>
 *             <td>`persistState`</td>
 *             <td>`{ "isMigrating": Boolean }`</td>
 *             <td>
 *                 Emitted in regular intervals to notify all components of Apify SDK that it is time to persist
 *                 their state, in order to avoid repeating the entire work when the actor restarts.
 *                 This event is automatically emitted together with the `migrating` event,
 *                 in which case the `isMigrating` flag is set to `true`. Otherwise the flag is `false`.
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
 * Emits event telling all comonents that they should persist their state in regular interval and also when actor is being
 * migrated to another worker.
 *
 * @ignore
 */
const emitPersistStateEvent = (isMigrating = false) => {
    events.emit(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, { isMigrating });
};

/**
 * Initializes `Apify.events` event emitter by creating connection to a websocket that provides them.
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

    // Locally there is no web socket to connect so just print a log message.
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
        // Don't print this error as this happens in a case of very short Apify.main().
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
