import { app } from 'electron';
import { startTrayApp } from './trayApp.js';

app.setName('Battle Standard Save Helper');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    startTrayApp();
  });

  app.on('window-all-closed', () => {
    // Tray-only app — do not quit when no windows are open.
  });
}
