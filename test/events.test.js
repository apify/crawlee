import WebSocket from 'ws';
import sinon from 'sinon';
import { ENV_VARS } from 'apify-shared/consts';
import { ACTOR_EVENT_NAMES_EX } from '../build/constants';
import { sleep } from '../build/utils';

import Apify from '../build';

describe('Apify.events', () => {
    let wss = null;
    let clock;
    beforeEach(() => {
        wss = new WebSocket.Server({ port: 9099 });
        clock = sinon.useFakeTimers();
        process.env[ENV_VARS.ACTOR_EVENTS_WS_URL] = 'ws://localhost:9099/someRunId';
        process.env[ENV_VARS.TOKEN] = 'dummy';
    });
    afterEach((done) => {
        wss.close(done);
        clock.restore();
        delete process.env[ENV_VARS.ACTOR_EVENTS_WS_URL];
        delete process.env[ENV_VARS.TOKEN];
    });
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
        let wsClosed = false;
        const isWsConnected = new Promise((resolve) => {
            wss.on('connection', (ws, req) => {
                ws.on('close', () => {
                    wsClosed = true;
                });
                resolve(ws);

                expect(req.url).toBe('/someRunId');

                const send = obj => ws.send(JSON.stringify(obj));

                setTimeout(() => send({ name: 'name-1', data: [1, 2, 3] }), 50);
                setTimeout(() => send({ name: 'name-1', data: { foo: 'bar' } }), 100);
                setTimeout(() => send({ name: 'name-2', data: [1] }), 50);
                setTimeout(() => send({ name: 'name-2', data: [2] }), 50);
            });
        });

        const eventsReceived = [];
        // Run main and store received events
        expect(wsClosed).toBe(false);
        Apify.main(async () => {
            await isWsConnected;
            Apify.events.on('name-1', data => eventsReceived.push(data));
            clock.tick(150);
            clock.restore();
            await sleep(10);
        });

        // Main will call process.exit() so we must stub it.
        const stubbedExit = sinon
            .stub(process, 'exit')
            .callsFake(async (code) => {
                expect(code).toBe(0);
                expect(eventsReceived).toEqual([[1, 2, 3], { foo: 'bar' }]);

                // Cleanup.
                stubbedExit.restore();
                wss.close(async () => {
                    await sleep(10); // Here must be short sleep to get following line to later tick
                    expect(wsClosed).toBe(true);
                    done();
                });
            });
    });

    test('should work without Apify.main()', async () => {
        let wsClosed = false;
        let finish;
        const closePromise = new Promise((resolve) => {
            finish = resolve;
        });
        const isWsConnected = new Promise((resolve) => {
            wss.on('connection', (ws, req) => {
                ws.on('close', () => {
                    wsClosed = true;
                    finish();
                });
                resolve(ws);

                expect(req.url).toBe('/someRunId');

                const send = obj => ws.send(JSON.stringify(obj));

                setTimeout(() => send({ name: 'name-1', data: [1, 2, 3] }), 50);
                setTimeout(() => send({ name: 'name-1', data: { foo: 'bar' } }), 100);
                setTimeout(() => send({ name: 'name-2', data: [1] }), 50);
                setTimeout(() => send({ name: 'name-2', data: [2] }), 50);
            });
        });

        const eventsReceived = [];
        // Connect to websocket and receive events.
        expect(wsClosed).toBe(false);
        await Apify.initializeEvents();
        await isWsConnected;
        Apify.events.on('name-1', data => eventsReceived.push(data));
        clock.tick(150);
        clock.restore();
        await sleep(10);

        expect(eventsReceived).toEqual([[1, 2, 3], { foo: 'bar' }]);

        expect(wsClosed).toBe(false);
        Apify.stopEvents();
        await closePromise;
        expect(wsClosed).toBe(true);
    });

    test('should send persist state events in regular interval', async () => {
        const eventsReceived = [];
        Apify.events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, data => eventsReceived.push(data));
        await Apify.initializeEvents();
        clock.tick(60001);
        clock.tick(60001);
        clock.tick(60001);
        await Apify.stopEvents();
        const eventCount = eventsReceived.length;
        expect(eventCount).toBe(3);
        expect(eventsReceived.length).toEqual(eventCount);
    });
});
