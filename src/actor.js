import http from 'http';
import fs from 'fs';

const Actor = {

    main(handler) {
        if (!handler || typeof (handler) !== 'function') {
            throw new Error('Handler function must be provided as a parameter');
        }
        const serverPort = parseInt(process.env.APIFIER_INTERNAL_PORT, 10);
        if (!(serverPort > 0 && serverPort < 65536)) {
            throw new Error('APIFIER_INTERNAL_PORT environment variable must be a value from 1 to 65535.');
        }

        const wrappedHandler = (req, res) => {
            try {
                handler(req, res);

                // close response if not yet
            } catch (e) {
                console.log('Received message!!!');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Hello World\n');
            }
        };

        const server = http.createServer(wrappedHandler);

        server.listen(serverPort, () => {
            console.log(`Listening on port ${serverPort}`);
            Actor.heyIAmReady();
        });
    },

    /**
     * Notifies Apifier runtime that act is listening on port specified by the APIFIER_INTERNAL_PORT environment
     * variable and is ready to receive a HTTP request with act input.
     */
    heyIAmReady() {
        const watchFileName = process.env.APIFIER_WATCH_FILE;
        if (watchFileName) {
            fs.writeFile(watchFileName, '', (err) => {
                if (err) console.log(`WARNING: Cannot write to watch file ${watchFileName}: ${err}`);
            });
        }
    },

};


export default Actor;

