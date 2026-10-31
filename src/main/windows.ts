import { BrowserWindow, nativeTheme, screen } from 'electron';
import { join } from 'node:path';

/** Vai trò cửa sổ quyết định quyền IPC, không tin role tự gửi từ renderer. */
export type WindowRole = 'main' | 'capture' | 'overlay' | 'test';

const TITLEBAR_HEIGHT = 38;
const TITLEBAR_SYMBOLS = { dark: '#b4b4b4', light: '#5d5f60' };

/** Dùng nền trong suốt để titlebar native theo cùng bề mặt với renderer. */
function titlebarOptions() {
  return {
    color: '#00000000',
    symbolColor: nativeTheme.shouldUseDarkColors ? TITLEBAR_SYMBOLS.dark : TITLEBAR_SYMBOLS.light,
    height: TITLEBAR_HEIGHT,
  };
}

/** Tạo cửa sổ cách ly và chỉ nạp nội dung của ứng dụng. */
export async function createWindow(
  role: WindowRole,
  created?: (window: BrowserWindow) => void,
): Promise<BrowserWindow> {
  const work = screen.getPrimaryDisplay().workArea;
  const overlay = role === 'overlay';
  const win = new BrowserWindow({
    title: role === 'test' ? 'Live Game Translator - Test source' : 'Live Game Translator',
    width: overlay ? 850 : role === 'test' ? 1100 : 1320,
    height: overlay ? 180 : role === 'test' ? 650 : 900,
    minWidth: role === 'main' ? 780 : undefined,
    minHeight: role === 'main' ? 600 : undefined,
    x: overlay ? work.x + Math.round((work.width - 850) / 2) : undefined,
    y: overlay ? work.y + work.height - 230 : undefined,
    show: false,
    frame: !overlay,
    titleBarStyle: role === 'main' ? 'hidden' : 'default',
    titleBarOverlay: role === 'main' ? titlebarOptions() : false,
    transparent: overlay,
    alwaysOnTop: overlay,
    skipTaskbar: overlay || role === 'capture',
    focusable: !overlay,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: role !== 'capture',
    },
  });
  created?.(win);
  if (role === 'main') {
    /** Đồng bộ nút cửa sổ khi theme hệ thống hoặc lựa chọn ứng dụng đổi. */
    function updateTitlebar(): void {
      if (!win.isDestroyed()) win.setTitleBarOverlay(titlebarOptions());
    }
    nativeTheme.on('updated', updateTitlebar);
    win.once('closed', () => nativeTheme.removeListener('updated', updateTitlebar));
  }
  win.on('page-title-updated', (event) => event.preventDefault());
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  if (overlay) {
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setContentProtection(true);
  }
  const url = process.env.ELECTRON_RENDERER_URL;
  if (url) await win.loadURL(`${url}?role=${role}`);
  else await win.loadURL(`app://bundle/index.html?role=${role}`);
  if (role === 'main' || role === 'test') win.show();
  return win;
}
