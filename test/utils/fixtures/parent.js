import { exec } from 'node:child_process';

for (let count = 1; count < 10; count++) {
    exec('node ./test/utils/fixtures/child.js');
}
