import WebSocket from 'ws';
import sinon from 'sinon';
import { ENV_VARS } from 'apify-shared/consts';
import { ACTOR_EVENT_NAMES_EX } from '../build/constants';
import { sleep } from '../build/utils';

import Apify from '../build';

describe('Apify.events', () => {
    test('is there and works as EventEmitter', () => {
        return new Promise((resolve, reject) => {
            try {
                Apify.events.on('foo', resolve);
                Apify.events.emit('foo', 'test event');
            } catch (e) {
                reject(e);
            }
        })
            .then((arg) => {
                expect(arg).toBe('test event');
            });
    });

    test('should work in Apify.main()', (done) => {
        const wss = new WebSocket.Server({ port: 9099 });
        const eventsReceived = [];
        let isWsConnected = false;

        // Create server that sends events
        wss.on('connection', (ws, req) => {
            isWsConnected = true;

            ws.on('close', () => {
                isWsConnected = false;
            });

            expect(req.url).toBe('/someRunId');

            const send = obj => ws.send(JSON.stringify(obj));

            setTimeout(() => send({ name: 'name-1', data: [1, 2, 3] }), 50);
            setTimeout(() => send({ name: 'name-1', data: { foo: 'bar' } }), 100);
            setTimeout(() => send({ name: 'name-2', data: [1] }), 50);
            setTimeout(() => send({ name: 'name-2', data: [2] }), 50);
        });

        process.env[ENV_VARS.ACTOR_EVENTS_WS_URL] = 'ws://localhost:9099/someRunId';
        process.env[ENV_VARS.TOKEN] = 'dummy';

        // Run main and store received events
        expect(isWsConnected).toBe(false);
        Apify.main(async () => {
            await sleep(10); // Here must be short sleep to get following line to later tick
            expect(isWsConnected).toBe(true);
            Apify.events.on('name-1', data => eventsReceived.push(data));
            await sleep(1000);
        });

        // Main will call process.exit() so we must stub it.
        const stubbedExit = sinon
            .stub(process, 'exit')
            .callsFake(async (code) => {
                expect(code).toBe(0);
                expect(eventsReceived).toEqual([[1, 2, 3], { foo: 'bar' }]);

                // Cleanup.
                stubbedExit.restore();
                wss.close();
                delete process.env[ENV_VARS.ACTOR_EVENTS_WS_URL];
                delete process.env[ENV_VARS.TOKEN];
                await sleep(10); // Here must be short sleep to get following line to later tick
                expect(isWsConnected).toBe(false);
                done();
            });
    });

    test('should work without Apify.main()', async () => {
        const wss = new WebSocket.Server({ port: 9099 });
        const eventsReceived = [];
        let isWsConnected = false;

        wss.on('connection', (ws, req) => {
            isWsConnected = true;

            ws.on('close', () => {
                isWsConnected = false;
            });

            expect(req.url).toBe('/someRunId');

            const send = obj => ws.send(JSON.stringify(obj));

            setTimeout(() => send({ name: 'name-1', data: [1, 2, 3] }), 50);
            setTimeout(() => send({ name: 'name-1', data: { foo: 'bar' } }), 100);
            setTimeout(() => send({ name: 'name-2', data: [1] }), 50);
            setTimeout(() => send({ name: 'name-2', data: [2] }), 50);
        });

        process.env[ENV_VARS.ACTOR_EVENTS_WS_URL] = 'ws://localhost:9099/someRunId';

        // Connect to websocket and receive events.
        expect(isWsConnected).toBe(false);
        await Apify.initializeEvents();
        await sleep(10); // Here must be short sleep to get following line to later tick
        expect(isWsConnected).toBe(true);
        Apify.events.on('name-1', data => eventsReceived.push(data));
        await sleep(1000);

        expect(eventsReceived).toEqual([[1, 2, 3], { foo: 'bar' }]);

        expect(isWsConnected).toBe(true);
        Apify.stopEvents();
        await sleep(10); // Here must be short sleep to get following line to later tick
        expect(isWsConnected).toBe(false);

        // Cleanup.
        wss.close();
        delete process.env[ENV_VARS.ACTOR_EVENTS_WS_URL];
    });

    test('should send persist state events in regular interval', async () => {
        process.env.APIFY_TEST_PERSIST_INTERVAL_MILLIS = 1;

        const eventsReceived = [];
        Apify.events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, data => eventsReceived.push(data));
        await Apify.initializeEvents();
        await sleep(10);
        await Apify.stopEvents();
        const eventCount = eventsReceived.length;
        expect(eventCount).toBeGreaterThan(2);
        await sleep(10);
        expect(eventsReceived.length).toEqual(eventCount);

        delete process.env.APIFY_TEST_PERSIST_INTERVAL_MILLIS;
    });
});
