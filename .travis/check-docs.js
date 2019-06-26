const { execSync } = require('child_process');

console.log('Checking if documentation is updated.');
execSync('npm run build-docs', { stdio: 'inherit'});
execSync('npm run build-readme', { stdio: 'inherit'});

console.log('Checking if all changes are committed.');
const gitStatus = execSync('git status --porcelain --branch', { encoding: 'utf8' });
const statusLines = gitStatus.split('\n');
console.log(gitStatus);
if (statusLines.length > 1 && statusLines[1].length) {
    console.error('You have uncommitted changes in the documentation. Please build the docs, review and commit changes.');
    process.exit(1);
}
