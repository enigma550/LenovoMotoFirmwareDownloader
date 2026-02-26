export async function openExternalUrl(url: string) {
  const command =
    process.platform === 'win32'
      ? { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url] }
      : process.platform === 'darwin'
        ? { cmd: 'open', args: [url] }
        : { cmd: 'xdg-open', args: [url] };

  const proc = Bun.spawn([command.cmd, ...command.args], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  });
  proc.unref();
  await proc.exited;
}
