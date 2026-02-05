const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const waitOn = require('wait-on');

let mainWindow;
let apiProcess;

// API Port (Must match where uvicorn runs)
const API_PORT = 8000; 
const API_URL = `http://127.0.0.1:${API_PORT}`;

function startPythonBackend() {
  const isDev = !app.isPackaged;
  
  // In Dev: Run uvicorn directly
  // In Prod: Run the compiled executable (created by PyInstaller)
  let scriptPath;
  let cmd;
  let args;

  if (isDev) {
    cmd = 'python'; // or 'python3'
    scriptPath = path.join(__dirname, '../backend/start.py');
    args = [scriptPath];
  } else {
    cmd = path.join(process.resourcesPath, 'api.exe'); // Windows executable
    args = [];
  }

  console.log(`Starting Backend: ${cmd} ${args.join(' ')}`);

  apiProcess = spawn(cmd, args);

  apiProcess.stdout.on('data', (data) => {
    console.log(`[Python]: ${data}`);
  });

  apiProcess.stderr.on('data', (data) => {
    console.error(`[Python Error]: ${data}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Altyazı Stüdyosu Pro",
    icon: path.join(__dirname, '../public/icon.png'), // Add an icon.png to public folder
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple interaction in this demo
    },
    autoHideMenuBar: true
  });

  // Wait for Python server to be ready before loading URL
  waitOn({
    resources: [API_URL],
    delay: 1000,
    timeout: 30000,
  }).then(() => {
    console.log("Backend is ready. Loading UI...");
    mainWindow.loadURL(API_URL);
  }).catch((err) => {
    console.error("Backend failed to start:", err);
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', () => {
  startPythonBackend();
  createWindow();
});

app.on('window-all-closed', function () {
  // Kill Python process on exit
  if (apiProcess) {
    apiProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// Ensure Backend is killed if App quits unexpectedly
app.on('will-quit', () => {
  if (apiProcess) apiProcess.kill();
});
