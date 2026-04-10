import type { DesktopApi } from '../../core/contracts/desktop/requests';

declare global {
  interface Window {
    desktopApi?: DesktopApi;
  }
}
