import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Đăng ký tsx loader trực tiếp trong runtime của Electron
register('tsx', pathToFileURL('./'));

// Sau khi đăng ký xong loader, nạp file chạy chính của dự án
import('./tooling/dev/launch-dev.ts');