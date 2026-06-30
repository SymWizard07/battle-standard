import { app } from 'electron';
import { startSetupApp } from './setupApp.js';

app.setName('Battle Standard Save Helper Setup');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    startSetupApp();
  });
}
