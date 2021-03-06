const {app, BrowserWindow, ipcMain, screen, shell, dialog} = require('electron');
const videos = require("./videos.json");
const Store = require('electron-store');
const store = new Store();
const request = require('request');
const https = require('https');
const fs = require('fs');
let screens = [];
let nq = false;
let cachePath = store.get('cachePath') ?? `${app.getPath('userData')}/videos`;
let downloading = false;

global.shared = {
    currentlyPlaying: ''
};

function createConfigWindow(argv) {
    let win = new BrowserWindow({
        width: 1000,
        height: 750,
        webPreferences: {
            nodeIntegration: true
        },
        resizable: false
    });
    win.loadFile('web/config.html');
    win.on('closed', function () {
        win = null;
    });
    if (argv) {
        if (argv.includes("/dt")) {
            win.webContents.openDevTools();
        }
    }
    screens.push(win);
}

function createJSONConfigWindow() {
    let win = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: true
        }
    });
    win.loadFile('json-editor/index.html');
    win.on('closed', function () {
        win = null;
    });
}

function createSSWindow() {
    let displays = screen.getAllDisplays();
    for (let i = 0; i < screen.getAllDisplays().length; i++) {
        let win = new BrowserWindow({
            width: displays[i].size.width,
            height: displays[i].size.height,
            webPreferences: {
                nodeIntegration: true
            },
            x: displays[i].bounds.x,
            y: displays[i].bounds.y,
            fullscreen: true,
            transparent: true,
            frame: false
        });
        win.setMenu(null);
        if (store.get("onlyShowVideoOnPrimaryMonitor") && displays[i].id !== screen.getPrimaryDisplay().id) {
            win.loadFile('web/black.html');
        } else {
            win.loadFile('web/screensaver.html');
        }
        win.on('closed', function () {
            xWin = null;
        });
        win.webContents.on('dom-ready', (event) => {
            let css = '* { cursor: none !important; }';
            win.webContents.insertCSS(css);
        });
        screens.push(win);
    }
}

function createSSPWindow(argv) {
    let win = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: true
        },
        /*transparent: true,
        frame: false*/
    });
    win.loadFile('web/screensaver.html');
    win.on('closed', function () {
        win = null;
    });
    if (argv) {
        if (argv.includes("/dt")) {
            win.webContents.openDevTools();
        }
    }
    screens.push(win);
}

app.allowRendererProcessReuse = true
app.whenReady().then(startUp);

function startUp() {
    if (!store.get("configured") || store.get("version") !== "v0.5.4") {
        //make video cache directory
        if (!fs.existsSync(`${app.getPath('userData')}/videos/`)) {
            fs.mkdirSync(`${app.getPath('userData')}/videos/`);
        }
        if (!fs.existsSync(`${app.getPath('userData')}/videos/temp`)) {
            fs.mkdirSync(`${app.getPath('userData')}/videos/temp`);
        }
        //video lists
        if (!store.get('allowedVideos')) {
            let allowedVideos = [];
            for (let i = 0; i < videos.length; i++) {
                allowedVideos.push(videos[i].id);
            }
            store.set('allowedVideos', allowedVideos);
        }
        store.set('downloadedVideos', store.get('downloadedVideos') ?? []);
        store.set('alwaysDownloadVideos', store.get('alwaysDownloadVideos') ?? []);
        store.set('neverDownloadVideos', store.get('neverDownloadVideos') ?? []);
        store.set('videoProfiles', store.get('videoProfiles') ?? []);
        store.set('customVideos', store.get('customVideos') ?? []);

        //general settings
        store.set('timeOfDay', store.get('timeOfDay') ?? false);
        store.set('sunrise', store.get('sunrise') ?? "06:00");
        store.set('sunset', store.get('sunset') ?? "18:00");
        store.set('playbackSpeed', store.get('playbackSpeed') ?? 1);
        store.set('skipVideosWithKey', store.get('skipVideosWithKey') ?? true);
        store.set('avoidDuplicateVideos', store.get('avoidDuplicateVideos') ?? true);
        //playback settings
        store.set('videoFilters', store.get('videoFilters') ?? [
            {name: 'blur', value: 0, min: 0, max: 100, suffix: "px", defaultValue: 0},
            {name: 'brightness', value: 100, min: 0, max: 100, suffix: "%", defaultValue: 100},
            {name: 'grayscale', value: 0, min: 0, max: 100, suffix: "%", defaultValue: 0},
            {name: 'hue-rotate', value: 0, min: 0, max: 360, suffix: "deg", defaultValue: 0},
            {name: 'invert', value: 0, min: 0, max: 100, suffix: "%", defaultValue: 0},
            {name: 'saturate', value: 100, min: 0, max: 256, suffix: "%", defaultValue: 100},
            {name: 'sepia', value: 0, min: 0, max: 100, suffix: "%", defaultValue: 0},
        ]);
        store.set('videoTransitionLength', store.get('videoTransitionLength') ?? 1000);
        //multi-screen settings
        store.set('sameVideoOnScreens', store.get('sameVideoOnScreens') ?? false);
        store.set('onlyShowVideoOnPrimaryMonitor', store.get('onlyShowVideoOnPrimaryMonitor') ?? false);
        //cache settings
        store.set('videoCache', store.get('videoCache') ?? false);
        store.set('videoCacheProfiles', store.get('videoCacheProfiles') ?? false);
        store.set('videoCacheSize', getCacheSize());
        store.set('videoCacheRemoveUnallowed', store.get('videoCacheRemoveUnallowed') ?? false);
        store.set('cachePath', store.get('cachePath') ?? cachePath);
        store.set('immediatelyUpdateVideoCache', store.get('immediatelyUpdateVideoCache') ?? true);
        //check for downloaded videos
        updateVideoCache();
        //text settings
        store.set('textFont', store.get('textFont') ?? "Segoe UI");
        store.set('textSize', store.get('textSize') ?? "2");
        store.set('textColor', store.get('textColor') ?? "#FFFFFF");
        store.set('displayText', store.get('displayText') ?? {
            'positionList': ["topleft", "topright", "bottomleft", "bottomright", "left", "right", "middle", "topmiddle", "bottommiddle"],
            'topleft': {'type': "none", "defaultFont": true},
            'topright': {'type': "none", "defaultFont": true},
            'bottomleft': {'type': "none", "defaultFont": true},
            'bottomright': {'type': "none", "defaultFont": true},
            'left': {'type': "none", "defaultFont": true},
            'right': {'type': "none", "defaultFont": true},
            'middle': {'type': "none", "defaultFont": true},
            'topmiddle': {'type': "none", "defaultFont": true},
            'bottommiddle': {'type': "none", "defaultFont": true}
        });
        store.set('videoQuality', store.get('videoQuality') ?? false);

        //config
        store.set('version', "v0.5.4");
        store.set("configured", true);
    }
    if (process.argv.includes("/nq")) {
        nq = true;
    }
    clearCacheTemp();
    if (store.get('videoCacheRemoveUnallowed')) {
        removeAllUnallowedVideosInCache();
    }
    removeAllNeverAllowedVideosInCache();
    if (process.argv.includes("/c")) {
        createConfigWindow(process.argv);
    } else if (process.argv.includes("/p")) {
        //createSSPWindow();
        app.quit();
    } else if (process.argv.includes("/s")) {
        createSSWindow();
    } else if (process.argv.includes("/t")) {
        createSSPWindow(process.argv);
    } else if (process.argv.includes("/j")) {
        createJSONConfigWindow();
    } else {
        createConfigWindow();
    }
    setTimeout(downloadVideos, 1500);
}

//let Aerial load the video with the self-signed cert
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.match(/^https:\/\/sylvan.apple.com/) !== null) {
        event.preventDefault();
        callback(true)
    } else {
        callback(false)
    }
});

ipcMain.on('quitApp', (event, arg) => {
    if (!nq) {
        app.quit();
    }
});

ipcMain.on('keyPress', (event, key) => {
    if (key === "ArrowRight" && store.get('skipVideosWithKey')) {
        for (let i = 0; i < screens.length; i++) {
            screens[i].webContents.send('newVideo');
        }
    } else {
        if (!nq) {
            app.quit();
        }
    }
});

ipcMain.on('updateCache', (event) => {
    const path = cachePath;
    let videoList = [];
    fs.readdir(path, (err, files) => {
        files.forEach(file => {
            if (file.includes('.mov')) {
                videoList.push(file.slice(0, file.length - 4));
            }
        });
        if (!downloading) {
            store.set('downloadedVideos', videoList);
        }
        store.set('videoCacheSize', getCacheSize());
        event.reply('displaySettings');
    });
    updateCustomVideos();
});

ipcMain.on('deleteCache', (event) => {
    removeAllVideosInCache();
    event.reply('displaySettings');
});

ipcMain.on('openCache', (event) => {
    shell.openExternal(cachePath);
});

ipcMain.on('selectCustomLocation', async (event, arg) => {
    const result = await dialog.showOpenDialog(screens[0], {
        properties: ['openDirectory']
    });
    const path = result.filePaths[0];
    let videoList = [];
    videoList.path = path;
    fs.readdir(path, (err, files) => {
        files.forEach(file => {
            if (file.includes('.mp4') || file.includes('.webm') || file.includes('.ogv')) {
                videoList.push(file);
            }
        });
        event.reply('newCustomVideos', videoList);
    });
    //event.reply('filePath', result.filePaths);
});

ipcMain.on('selectCacheLocation', async (event, arg) => {
    const result = await dialog.showOpenDialog(screens[0], {
        properties: ['openDirectory']
    });
    const path = result.filePaths[0];
    //removeAllVideosInCache();
    if (path != undefined) {
        cachePath = path;
        store.set('cachePath', path);
        updateVideoCache(() => {
            event.reply('displaySettings');
        });
    }
});

ipcMain.on('refreshCache', (event) => {
    if (store.get('immediatelyUpdateVideoCache')) {
        if (!downloading) {
            downloadVideos();
        }
        if (store.get('videoCacheRemoveUnallowed')) {
            removeAllUnallowedVideosInCache();
            removeAllNeverAllowedVideosInCache();
        }
    }
});

ipcMain.on('openPreview', (event) => {
    nq = true;
    createSSPWindow(process.argv);
});

ipcMain.on('refreshConfig', (event) => {
    store.set("configured", false);
    app.quit();
});

ipcMain.on('resetConfig', (event) => {
    fs.unlink(`${app.getPath('userData')}/config.json`, err => {});
    app.quit();
});

function updateCustomVideos() {
    let allowedVideos = store.get('allowedVideos');
    let customVideos = store.get('customVideos');
    for (let i = 0; i < allowedVideos.length; i++) {
        if (allowedVideos[i][0] === "_") {
            let index = customVideos.findIndex((e) => {
                if (allowedVideos[i] === e.id) {
                    return true;
                }
            });
            if (index === -1) {
                allowedVideos.splice(index, 1);
                i--;
            }
        }
    }
    store.set('allowedVideos', allowedVideos);
}

//file download
function downloadFile(file_url, targetPath, callback) {
    // Save variable to know progress
    var received_bytes = 0;
    var total_bytes = 0;

    agentOptions = {
        host: 'sylvan.apple.com'
        , path: '/'
        , rejectUnauthorized: false
    };

    let agent = new https.Agent(agentOptions);

    let req = request({
        method: 'GET',
        uri: file_url,
        agent: agent
    });

    let out = fs.createWriteStream(targetPath);
    req.pipe(out);

    req.on('response', function (data) {
        // Change the total bytes value to get progress later.
        total_bytes = parseInt(data.headers['content-length']);
    });

    req.on('data', function (chunk) {
        // Update the received bytes
        received_bytes += chunk.length;

        showProgress(received_bytes, total_bytes);
    });

    req.on('end', function (e) {
        //console.log("File successfully downloaded");
        callback();
    });

    req.on('error', function (err) {
        //console.error(err)
    });

    function showProgress(received, total) {
        let percentage = (received * 100) / total;
        //console.log(percentage + "% | " + received + " bytes out of " + total + " bytes.");
    }
}

function downloadVideos() {
    let allowedVideos = getVideosToDownload();
    let downloadedVideos = store.get('downloadedVideos') ?? [];
    let flag = false;
    for (let i = 0; i < allowedVideos.length; i++) {
        if (!downloadedVideos.includes(allowedVideos[i])) {
            let flag = true;
            let index = videos.findIndex((v) => {
                if (allowedVideos[i] === v.id) {
                    return true;
                }
            });
            //console.log(`Downloading ${videos[index].name}`);
            downloadFile(videos[index].src.H2641080p, `${cachePath}/temp/${allowedVideos[i]}.mov`, () => {
                fs.copyFileSync(`${cachePath}/temp/${allowedVideos[i]}.mov`, `${cachePath}/${allowedVideos[i]}.mov`);
                fs.unlink(`${cachePath}/temp/${allowedVideos[i]}.mov`, (err) => {
                });
                downloadedVideos.push(allowedVideos[i]);
                store.set('downloadedVideos', downloadedVideos);
                store.set('videoCacheSize', getCacheSize());
                downloadVideos();
            });
            break;
        }
    }
    downloading = flag;
}

function getAllFilesInCache() {
    return fs.readdirSync(cachePath);
}

function getCacheSize() {
    let totalSize = 0;
    getAllFilesInCache().forEach(function (filePath) {
        if (fs.existsSync(`${cachePath}/${filePath}`)) {
            totalSize += fs.statSync(`${cachePath}/${filePath}`).size;
        }
    });
    return totalSize;
}

function removeAllVideosInCache() {
    getAllFilesInCache().forEach(file => {
        if (fs.existsSync(`${cachePath}/${file}`)) {
            fs.unlink(`${cachePath}/${file}`, (err) => {
            });
        }
    });
    store.set('videoCacheSize', getCacheSize());
}

function removeAllUnallowedVideosInCache() {
    let allowedVideos = getVideosToDownload();
    let downloadedVideos = store.get('downloadedVideos') ?? [];
    for (let i = 0; i < downloadedVideos.length; i++) {
        if (!allowedVideos.includes(downloadedVideos[i])) {
            fs.unlink(`${cachePath}/${downloadedVideos[i]}.mov`, (err) => {
            });
        }
    }
    updateVideoCache();
}

function removeAllNeverAllowedVideosInCache() {
    let neverAllowedVideos = store.get('neverDownloadVideos');
    let downloadedVideos = store.get('downloadedVideos') ?? [];
    for (let i = 0; i < downloadedVideos.length; i++) {
        if (neverAllowedVideos.includes(downloadedVideos[i])) {
            fs.unlink(`${cachePath}/${downloadedVideos[i]}.mov`, (err) => {
            });
            downloadedVideos.splice(i, 1);
            i--;
        }
    }
    store.set('videoCacheSize', getCacheSize());
}

function getVideosToDownload() {
    let allowedVideos = store.get('videoCache') ? store.get('allowedVideos') : [];
    store.get('alwaysDownloadVideos').forEach(e => {
        allowedVideos.push(e);
    });
    if (store.get("videoCacheProfiles") && store.get('videoCache')) {
        store.get('videoProfiles').forEach(e => {
            allowedVideos.push(...e.videos);
        });
    }
    allowedVideos = allowedVideos.filter(function (item, pos, self) {
        return self.indexOf(item) === pos;
    });
    store.get('neverDownloadVideos').forEach(e => {
        if (allowedVideos.includes(e)) {
            allowedVideos = allowedVideos.splice(allowedVideos.indexOf(e), 1);
        }
    });
    return allowedVideos;
}

function updateVideoCache(callback) {
    let videoList = [];
    fs.readdir(cachePath, (err, files) => {
        files.forEach(file => {
            if (file.includes('.mov')) {
                videoList.push(file.slice(0, file.length - 4));
            }
        });
        if (!downloading) {
            store.set('downloadedVideos', videoList);
        }
        store.set('videoCacheSize', getCacheSize());
        if (callback) {
            callback();
        }
    });
}

function clearCacheTemp() {
    if (!fs.existsSync(`${app.getPath('userData')}/videos/`)) {
        fs.mkdirSync(`${app.getPath('userData')}/videos/`);
    }
    if (!fs.existsSync(`${app.getPath('userData')}/videos/temp`)) {
        fs.mkdirSync(`${app.getPath('userData')}/videos/temp`);
    }
    let dir = fs.readdirSync(cachePath + "\\temp").forEach(file => {
        if (fs.existsSync(`${cachePath}/temp/${file}`)) {
            fs.unlink(`${cachePath}/temp/${file}`, (err) => {
            });
        }
    });
}