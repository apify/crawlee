const cp = require('child_process');

for (let count = 1; count < 10; count++) {
    cp.exec('node ./test/utils/fixtures/child.js');
}