import http from 'http';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import express from 'express';
import socketio from 'socket.io';
import log from 'apify-shared/log';
import { promisifyServerListen } from 'apify-shared/utilities';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';

const DEFAULT_SCREENSHOT_DIRECTORY_PATH = path.resolve('live_view');
const MAX_SCREENSHOT_FILES = 10;


const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const ensureDir = promisify(fs.ensureDir);

export default class LiveViewServer {
    constructor(options = {}) {
        const {
            screenshotDirectoryPath = DEFAULT_SCREENSHOT_DIRECTORY_PATH,
        } = options;

        const containerPort = process.env[ENV_VARS.CONTAINER_PORT] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_PORT];

        this.port = parseInt(containerPort, 10);
        if (!(this.port >= 0 && this.port <= 65535)) {
            throw new Error('Cannot start LiveViewServer - invalid port specified by the '
                + `${ENV_VARS.CONTAINER_PORT} environment variable (was "${containerPort}").`);
        }
        this.liveViewUrl = process.env[ENV_VARS.CONTAINER_URL] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_URL];
        this.screenshotDirectoryPath = screenshotDirectoryPath;

        // Snapshot data
        this.lastSnapshot = null;
        this.lastScreenshotIndex = 0;
        this.screenshotIndexToFilePath = {};

        // Setup HTTP server and Express router
        this._isRunning = false;
        this.httpServer = http.createServer();
        this.app = express();

        this.app.use('/', express.static(__dirname));

        // Serves a JS file with the last snapshot, so the the client can immediately show something
        this.app.get('/init-last-snapshot.js', (req, res) => {
            res.set('Content-Type', 'text/javascript');
            res.send(`window.lastSnapshot = ${JSON.stringify(this.lastSnapshot, null, 2)};`);
        });

        // Serves JPEG with the last screenshot
        this.app.get('/screenshot', (req, res) => {
            const screenshotIndex = req.query.index;
            const filePath = this.screenshotIndexToFilePath[screenshotIndex];
            if (!filePath) {
                return res.status(404).send('Oops, there is no such screenshot.');
            }
            // TODO: Limit snapshot sizes to avoid choking the system (was 5MB),
            // return replacement image if too large
            res.sendFile(filePath);
        });

        this.app.all('*', (req, res) => {
            res.status(404).send('Nothing here');
        });

        this.httpServer.on('request', this.app);

        // Socket.io server used to send snapshots to client
        this.clientCount = 0;
        this.socketio = socketio(this.httpServer);
        this.socketio.on('connection', (socket) => {
            this.clientCount++;
            log.info('Live view client connected', { clientId: socket.id });
            socket.on('disconnect', (reason) => {
                this.clientCount--;
                log.info('Live view client disconnected', { clientId: socket.id, reason });
            });
        });
    }

    /**
     * Starts the HTTP server.
     */
    async start() {
        await ensureDir(this.screenshotDirectoryPath);
        await promisifyServerListen(this.httpServer)(this.port);
        log.info('Live view web server started', { publicUrl: this.liveViewUrl });
        this._isRunning = true;
    }

    async stop() {
        return new Promise((resolve) => {
            this.httpServer.close((err) => {
                this._isRunning = false;
                if (err) log.exception(err, 'Live view web server could not be stopped.');
                else log.info('Live view web server stopped.');
                resolve();
            });
        });
    }

    async serve(page) {
        if (!this.hasClients()) return;
        const snapshot = await this._makeSnapshot(page);
        await this._pushSnapshot(snapshot);
    }

    get isRunning() {
        return this._isRunning;
    }

    hasClients() {
        return this.clientCount > 0;
    }

    getScreenshotPath(screenshotIndex) {
        return path.join(this.screenshotDirectoryPath, screenshotIndex);
    }

    async _makeSnapshot(page) {
        const pageUrl = page.url();
        log.info('Making live view snapshot.', { pageUrl });
        const [htmlContent, screenshot] = await Promise.all([
            page.content(),
            page.screenshot(),
        ]);

        const screenshotIndex = this.lastScreenshotIndex++;

        await writeFile(this.getScreenshotPath(screenshotIndex), screenshot);
        if (screenshotIndex > MAX_SCREENSHOT_FILES) {
            this._deleteScreenshot(MAX_SCREENSHOT_FILES - screenshotIndex);
        }

        const snapshot = { pageUrl, htmlContent, screenshotIndex };
        this.lastSnapshot = snapshot;
        return snapshot;
    }

    /**
     * To be called when the snapshot of screen and HTML content was saved.
     */
    async _pushSnapshot(snapshot) {
        // Send new snapshot to clients
        log.info('Sending live view snapshot', { snapshot });
        this.socketio.emit('snapshot', snapshot);
    }

    _deleteScreenshot(screenshotIndex) { // eslint-disable-line class-methods-use-this
        unlink(this.getScreenshotPath(screenshotIndex))
            .catch(err => log.exception(err, 'Cannot delete live view screenshot.'));
    }
}
