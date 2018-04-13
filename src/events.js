import EventEmitter from 'events';
import WebSocket from 'ws';
import log from 'apify-shared/log';
import { ENV_VARS, ACTOR_EVENT_NAMES } from './constants';

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
 * Event emitter providing access to events from Actor infrastructure. Event emitter is initiated by Apify.main().
 * If you don't use Apify.main() then you must call `await Apify.initializeEvents()` yourself.
 *
 * Example usage:
 *
 * ```javascript
 * import { ACTOR_EVENT_NAMES } from 'apify/constants';
 *
 * Apify.main(async () => {
 *   &nbsp;
 *   Apify.events.on(ACTOR_EVENT_NAMES.CPU_INFO, (data) => {
 *     if (data.isCpuOverloaded) console.log('OH NO! We are overloading CPU!');
 *   });
 *.  &nbsp;
 * });
 * ```
 *
 * Event types:
 *
 * <table class="table table-bordered table-condensed">
 *     <thead>
 *         <tr>
 *             <th>Event</th>
 *             <th>Name</th>
 *             <th>Constant</th>
 *             <th>Message</th>
 *             <th>Description</th>
 *     </thead>
 *     <tbody>
 *         <tr>
 *             <td>`cpuInfo`</td>
 *             <td>`ACTOR_EVENT_NAMES.CPU_INFO`</td>
 *             <td>`{ "isCpuOverloaded": true }`</td>
 *             <td>
 *                 This event is send every second and contains information if act is using maximum amount of available
 *                 CPU power. If maximum is reached then there is no point in adding more workload.
 *             </td>
 *         </tr>
 *         <tr>
 *             <td>`migrating`</td>
 *             <td>`ACTOR_EVENT_NAMES.MIGRATING`</td>
 *             <td>`null`</td>
 *             <td>
 *                 This event is send when act is going to be migrated to another worker machine. In this case act run will
 *                 be stopped and then reinitialized at another server.
 *             </td>
 *         </tr>
 *         <tr>
 *             <td>`persistState`</td>
 *             <td>`ACTOR_EVENT_NAMES.PERSIST_STATE`</td>
 *             <td>`{ "isMigrating": true }`</td>
 *             <td>
 *                 This event is send in regular intervals to notify all components of Apify SDK that it's time to persist
 *                 state. This prevents situation when act gets restarted due to a migration to another worker machine and
 *                 needs to start from scratch. This event is also send as a result of `ACTOR_EVENT_NAMES.MIGRATING` and in
 *                 this case the message is `{ "isMigrating": true }`.
 *             </td>
 *         </tr>
 *     </tbody>
 * </table>
 *
 * See <a href="https://nodejs.org/api/events.html#events_class_eventemitter" target="_blank">NodeJs documentation</a>
 * for more information on event emitter use.
 *
 * @memberof module:Apify
 * @name events
 */
export default events;

/**
 * Emits event telling all comonents that they should persist their state in regular interval and also when act is being
 * migrated to another worker.
 *
 * @ignore
 */
const emitPersistStateEvent = (isMigrating = false) => {
    events.emit(ACTOR_EVENT_NAMES.PERSIST_STATE, { isMigrating });
};

/**
 * Initializes Apify.events event emitter by creating connection to a websocket that provides them.
 * This is automatically called by `Apify.main()`.
 *
 * @memberof module:Apify
 * @name initializeEvents
 * @function
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
        log.info(`Apify.events: Environment variable ${ENV_VARS.ACTOR_EVENTS_WS_URL} is not set, no events from Apify platform will be emitted.`);
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
    eventsWs.on('error', err => log.exception(err, 'Apify.events: web socket connection failed'));
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
 */
export const stopEvents = () => {
    if (eventsWs) eventsWs.close();
    clearInterval(persistStateInterval);
    persistStateInterval = null;
};
