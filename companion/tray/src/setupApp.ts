import { app, dialog } from 'electron';
import { registerFirefoxNativeHost, syncBundledHostToInstall } from './registerHost.js';

export async function runSetup(): Promise<boolean> {
  const launcherPath = await syncBundledHostToInstall();
  if (!launcherPath) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Save Helper Setup',
      message: 'Could not install the native host.',
      detail: 'Try running setup again from your normal user account.',
    });
    return false;
  }

  try {
    await registerFirefoxNativeHost(launcherPath);
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Save Helper Setup',
      message: 'Host installed but Firefox registration failed.',
      detail: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  await dialog.showMessageBox({
    type: 'info',
    title: 'Save Helper setup complete',
    message: 'Firefox can now connect to Save Helper.',
    detail:
      'Return to Battle Standard in your browser and choose a save folder when prompted.',
  });
  return true;
}

export function startSetupApp(): void {
  void (async () => {
    await runSetup();
    app.quit();
  })();
}
