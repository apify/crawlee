import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import { newPromise } from './utils';

/* global process */


export const main = (userFunc) => {
    if (!userFunc || typeof (userFunc) !== 'function') {
        throw new Error('Handler function must be provided as a parameter');
    }
    const serverPort = parseInt(process.env.APIFIER_INTERNAL_PORT, 10);
    if (!(serverPort > 0 && serverPort < 65536)) {
        throw new Error('APIFIER_INTERNAL_PORT environment variable must have a value from 1 to 65535.');
    }

    const handler = (req, res) => {
        const options = {
            input: req.body,
        };

        newPromise()
            .then(() => {
                return userFunc(options);
            })
            .then(() => {
                res.statusCode = 200;
            })
            .catch((err) => {
                console.log(`User act failed: ${err}`);
                res.statusCode = 500;
            })
            .then(() => {
                res.end((err) => {
                    if (err) {
                        console.log(`Failed to send HTTP response: ${err}`);
                        process.exit(1);
                    }
                    console.log('All good, finishing the act');
                    process.exit(0);
                });
            })
            .catch((err) => {
                console.log(`Something went terribly wrong: ${err}`);
                process.exit(2);
            });
    };

    const app = express();

    // parse application/json
    app.use(bodyParser.json());
    app.use(handler);

    // TODO: handle errors!
    app.listen(serverPort, () => {
        // console.log(`Listening on port ${serverPort}`);
        Actor.heyIAmReady();
    });
};

/**
 * Notifies Apifier runtime that act is listening on port specified by the APIFIER_INTERNAL_PORT environment
 * variable and is ready to receive a HTTP request with act input.
 */
export const heyIAmReady = () => {
    const watchFileName = process.env.APIFIER_WATCH_FILE;
    if (watchFileName) {
        fs.writeFile(watchFileName, '', (err) => {
            if (err) console.log(`WARNING: Cannot write to watch file ${watchFileName}: ${err}`);
        });
    }
};
