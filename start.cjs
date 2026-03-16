const { spawn } = require('child_process');
const path = require('path');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const electronExe = require('electron'); // path to electron binary in node_modules

const child = spawn(electronExe, ['.'], {
    env,
    stdio: 'inherit'
});

child.on('close', code => {
    process.exit(code);
});
