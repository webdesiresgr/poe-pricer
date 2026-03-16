const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const axios = require('axios');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            webviewTag: true
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0f172a',
            symbolColor: '#cbd5e1'
        }
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// Avoid rate limits and CORS by proxying requests via main process
ipcMain.handle('fetch-poe-data', async (event, url, cookie) => {
    try {
        let cleanCookie = cookie.trim();
        // Remove 'POESESSID=' prefix if the user pasted it
        if (cleanCookie.toLowerCase().startsWith('poesessid=')) {
            cleanCookie = cleanCookie.substring(10);
        }

        const response = await axios.get(url, {
            headers: {
                'Cookie': `POESESSID=${cleanCookie};`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://www.pathofexile.com/',
                'Origin': 'https://www.pathofexile.com'
            }
        });
        return { data: response.data, error: null };
    } catch (err) {
        console.error("PoE API Error:", err.message);

        let errorMsg = err.message;
        if (err.response) {
            if (err.response.data && err.response.data.error) {
                const dErr = err.response.data.error;
                errorMsg = typeof dErr === 'object' ? (dErr.message || JSON.stringify(dErr)) : dErr;
            } else {
                errorMsg = err.response.statusText || JSON.stringify(err.response.data);
            }
        }

        return {
            data: null,
            error: errorMsg,
            retryAfter: err.response?.headers?.['retry-after']
        };
    }
});

ipcMain.handle('fetch-ninja-data', async (event, url) => {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        return { data: response.data, error: null };
    } catch (err) {
        console.error("Ninja API Error:", err.message);
        return { data: null, error: err.message };
    }
});

ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
