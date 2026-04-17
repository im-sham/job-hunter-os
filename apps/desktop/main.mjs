import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
} from 'electron';
import { startDashboardServer } from '../dashboard/lib/dashboard-server.mjs';
import {
  initWorkspace,
  workspaceDoctor,
} from '../../packages/core/src/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_NAME = 'Job Hunter OS';

let dashboardHandle = null;
let dashboardUrl = '';
let workspacePath = '';
let mainWindow = null;
let loadingWindow = null;

function defaultWorkspacePath() {
  const documentsPath = app.getPath('documents') || app.getPath('home');
  return path.join(documentsPath, 'Job Hunter OS Workspace');
}

function bundledPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function ensureWorkspaceReady() {
  workspacePath = defaultWorkspacePath();

  if (!fs.existsSync(workspacePath)) {
    initWorkspace({ workspaceArg: workspacePath });
    return workspacePath;
  }

  const entries = fs.readdirSync(workspacePath);
  if (!entries.length) {
    initWorkspace({ workspaceArg: workspacePath, force: true });
    return workspacePath;
  }

  const doctor = workspaceDoctor(workspacePath);
  if (!doctor.ok) {
    throw new Error(
      `The local workspace at "${workspacePath}" is incomplete. Move it aside or use Reset Workspace once the app opens.`
    );
  }

  return workspacePath;
}

async function resetWorkspace() {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Reset Workspace'],
    defaultId: 0,
    cancelId: 0,
    title: APP_NAME,
    message: 'Reset the local Job Hunter OS workspace?',
    detail: `This replaces the current workspace in:\n${workspacePath}\n\nUse this only if you want a fresh starter setup.`,
  });

  if (result.response !== 1) {
    return { ok: false, cancelled: true };
  }

  initWorkspace({ workspaceArg: workspacePath, force: true });

  if (mainWindow && dashboardUrl) {
    await mainWindow.loadURL(`${dashboardUrl}/?desktop=1`);
  }

  return {
    ok: true,
    cancelled: false,
    workspacePath,
  };
}

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    resizable: false,
    movable: true,
    show: true,
    backgroundColor: '#f3ede2',
    webPreferences: {
      sandbox: false,
    },
  });

  const markup = `
    <html>
      <body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Avenir Next',sans-serif;background:linear-gradient(160deg,#f4ecdf 0%,#efe4d1 52%,#eadfcf 100%);color:#2f2418;display:flex;align-items:center;justify-content:center;">
        <div style="max-width:320px;padding:28px;border:1px solid rgba(84,63,41,0.14);border-radius:24px;background:rgba(255,251,245,0.92);box-shadow:0 24px 60px -38px rgba(47,36,24,0.12);text-align:center;">
          <div style="text-transform:uppercase;letter-spacing:0.16em;font-size:12px;color:#6e5c47;">Job Hunter OS</div>
          <h1 style="font-family:'Iowan Old Style','Palatino Linotype',serif;font-size:32px;line-height:1;margin:14px 0 10px;">Opening your local workspace</h1>
          <p style="margin:0;color:#6e5c47;font-size:15px;line-height:1.5;">Preparing the dashboard and keeping your data local on this computer.</p>
        </div>
      </body>
    </html>
  `;

  loadingWindow.loadURL(`data:text/html,${encodeURIComponent(markup)}`);
}

function createMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Open Workspace Folder',
          click: () => {
            shell.openPath(workspacePath);
          },
        },
        {
          label: 'Reset Workspace',
          click: () => {
            resetWorkspace().catch(error => {
              dialog.showErrorBox(APP_NAME, error.message);
            });
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Workspace Folder',
          click: () => {
            shell.openPath(workspacePath);
          },
        },
        {
          label: 'Open Source README',
          click: () => {
            shell.openPath(bundledPath('README.md'));
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: '#f3ede2',
    title: APP_NAME,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close();
    }
    mainWindow.show();
  });

  await mainWindow.loadURL(`${dashboardUrl}/?desktop=1`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootDesktopApp() {
  ensureWorkspaceReady();
  dashboardHandle = await startDashboardServer({
    workspaceArg: workspacePath,
    port: 0,
    repoRoot: app.getAppPath(),
  });
  dashboardUrl = `http://127.0.0.1:${dashboardHandle.port}`;
  console.log(`${APP_NAME} desktop app running at ${dashboardUrl}`);
  console.log(`Workspace: ${workspacePath}`);

  createMenu();
  createLoadingWindow();
  await createMainWindow();
}

ipcMain.handle('desktop:get-context', () => ({
  isDesktop: true,
  appName: APP_NAME,
  workspacePath,
  storageLabel: 'Stored locally in your Documents folder.',
}));

ipcMain.handle('desktop:open-workspace', async () => {
  const opened = await shell.openPath(workspacePath);
  return {
    ok: opened === '',
    workspacePath,
  };
});

ipcMain.handle('desktop:reset-workspace', async () => resetWorkspace());

app.whenReady()
  .then(bootDesktopApp)
  .catch(error => {
    dialog.showErrorBox(APP_NAME, error.message);
    app.quit();
  });

app.on('activate', async () => {
  if (!BrowserWindow.getAllWindows().length && dashboardUrl) {
    await createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  dashboardHandle?.server?.close();
});
