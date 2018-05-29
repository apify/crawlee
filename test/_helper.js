import fs from 'fs-extra';
import path from 'path';
import { expect } from 'chai';
import { ENV_VARS } from '../build/constants';

export const LOCAL_EMULATION_DIR = path.join(__dirname, '..', 'tmp', 'local-emulation-dir');

// Log unhandled rejections.
process.on('unhandledRejection', (err) => {
    console.log('---------------------------------------------------------------------');
    console.log('------------- WARNING: Unhandled promise rejection !!!! -------------');
    console.log('---------------------------------------------------------------------');
    console.log(err);
});

// Immediately ensure that local emulation dir exists.
fs.ensureDirSync(path.resolve(LOCAL_EMULATION_DIR));

export const emptyLocalEmulationSubdir = (subdir) => {
    const fullPath = path.resolve(path.join(LOCAL_EMULATION_DIR, subdir));

    fs.emptyDirSync(fullPath);
};

export const expectNotLocalEmulation = () => expect(process.env[ENV_VARS.LOCAL_EMULATION_DIR]).to.be.a('undefined');

export const expectDirEmpty = (dirPath) => {
    const content = fs.readdirSync(dirPath);
    expect(content).to.have.lengthOf(0);
};

export const expectDirNonEmpty = (dirPath) => {
    const content = fs.readdirSync(dirPath);
    expect(content).to.have.lengthOf.above(0);
};
