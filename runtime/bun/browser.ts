import { spawnDetachedCommand } from './process/index.ts';

export async function openExternalUrl(url: string) {
  const command =
    process.platform === 'win32'
      ? { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url] }
      : process.platform === 'darwin'
        ? { cmd: 'open', args: [url] }
        : { cmd: 'xdg-open', args: [url] };

  await spawnDetachedCommand({
    args: command.args,
    command: command.cmd,
    envMode: 'external-command',
  });
}
