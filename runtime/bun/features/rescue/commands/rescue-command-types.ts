import type { RescueQdlStorage } from '../../../../shared/desktop-rpc';

export type PreparedFastbootCommand = {
  tool: 'fastboot';
  label: string;
  softFail: boolean;
  timeoutMs: number;
  args: string[];
};

export type PreparedEdlFirehoseCommand = {
  tool: 'edl-firehose';
  label: string;
  softFail: false;
  timeoutMs: number;
  storage: Exclude<RescueQdlStorage, 'auto'>;
  serial?: string;
  programmerPath: string;
  rawprogramPath: string;
  patchPath?: string;
  includePaths?: string[];
  validateWithDryRun?: boolean;
};

export type PreparedUnisocPacCommand = {
  tool: 'unisoc-pac';
  label: string;
  softFail: false;
  timeoutMs: number;
  pacPath: string;
  dataReset: 'yes' | 'no';
};

export type PreparedRescueCommand =
  | PreparedFastbootCommand
  | PreparedEdlFirehoseCommand
  | PreparedUnisocPacCommand;
