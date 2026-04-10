import type { DesktopApi } from '../core/contracts/desktop/index';

declare global {
  interface Window {
    desktopApi?: DesktopApi;
  }
}

export {};
