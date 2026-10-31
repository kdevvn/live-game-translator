import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/vietnamese-400.css';
import '@fontsource/ibm-plex-sans/vietnamese-500.css';
import '@fontsource/ibm-plex-sans/vietnamese-600.css';
import './styles/daisyui.css';
import './styles/themes.css';
import './styles/app.css';
import { App } from './App';
import { TestSource } from './features/capture/TestSource';
import { initializeCapture } from './features/capture/captureRuntime';
import { i18n, initializeI18n } from './i18n';

/** Bootstrap theo vai trò trước khi render để hạn chế nháy locale/theme sai. */
async function bootstrap(): Promise<void> {
  const role = new URL(window.location.href).searchParams.get('role');
  if (role === 'capture') {
    const dispose = initializeCapture();
    window.addEventListener('beforeunload', dispose, { once: true });
    return;
  }
  const root = document.getElementById('root');
  if (!root) return;
  if (role === 'test') {
    await initializeI18n();
    createRoot(root).render(<TestSource />);
    return;
  }
  const result = await window.app.snapshot();
  await initializeI18n(result.ok ? result.value.settings.locale : 'vi');
  if (!result.ok) {
    root.textContent = i18n.t('errors.INTERNAL');
    return;
  }
  document.documentElement.dataset.theme = result.value.resolvedTheme;
  createRoot(root).render(<App initial={result.value} overlay={role === 'overlay'} />);
}
void bootstrap();
