console.log(Object.keys(require('electron')));
app = require('electron').app;
console.log("App is:", app ? "defined" : "undefined");
if (!app) {
    app = require('electron').default?.app;
    console.log("App on default is:", app ? "defined" : "undefined");
}
require('electron').app?.quit();
