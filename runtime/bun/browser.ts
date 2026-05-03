import { launchDetachedCommand } from './process/index.ts';

type ExternalUrlOpenCommand = {
  args: string[];
  command: string;
};

const OPEN_URL_SETTLE_MS = 1_500;

function externalUrlOpenCommands(url: string): ExternalUrlOpenCommand[] {
  if (process.platform === 'win32') {
    return [
      { command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] },
      { command: 'explorer.exe', args: [url] },
    ];
  }

  if (process.platform === 'darwin') {
    return [{ command: 'open', args: [url] }];
  }

  return [
    { command: 'xdg-open', args: [url] },
    { command: 'gio', args: ['open', url] },
    { command: 'kde-open5', args: [url] },
    { command: 'kde-open', args: [url] },
    { command: 'gnome-open', args: [url] },
  ];
}

function describeCommandFailure(command: ExternalUrlOpenCommand, detail: string) {
  const renderedCommand =
    command.command === 'gio' && command.args[0] === 'open' ? 'gio open' : command.command;
  return `${renderedCommand}: ${detail}`;
}

export async function openExternalUrl(url: string) {
  const failures: string[] = [];
  for (const openCommand of externalUrlOpenCommands(url)) {
    const result = await launchDetachedCommand({
      args: openCommand.args,
      command: openCommand.command,
      envMode: 'external-command',
      settleMs: OPEN_URL_SETTLE_MS,
    });

    if (result.started) {
      return;
    }

    const detail = result.error || `exited with code ${result.exitCode ?? 'unknown'}`;
    failures.push(describeCommandFailure(openCommand, detail));
  }

  throw new Error(`Could not open URL with the system browser. ${failures.join(' | ')}`);
}
