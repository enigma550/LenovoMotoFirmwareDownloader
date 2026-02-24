import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { ensureDesktopBridgeReady } from './app/core/bridge/electrobun-bridge';

const renderFatal = (title: string, error: unknown) => {
  const container = document.createElement('pre');
  container.style.margin = '16px';
  container.style.padding = '12px';
  container.style.border = '1px solid #fecaca';
  container.style.background = '#fff1f2';
  container.style.color = '#881337';
  container.style.whiteSpace = 'pre-wrap';
  container.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  container.textContent = `${title}\n\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;

  document.body.innerHTML = '';
  document.body.appendChild(container);
};

window.addEventListener('error', (event) => {
  renderFatal('Unhandled window error', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  renderFatal('Unhandled promise rejection', event.reason);
});

bootstrapApplication(App, appConfig)
  .then(() => {
    void ensureDesktopBridgeReady().catch((err) => {
      console.error('[DesktopBridge] Unexpected init error', err);
    });
  })
  .catch((err) => {
    console.error(err);
    renderFatal('Angular bootstrap failed', err);
  });
