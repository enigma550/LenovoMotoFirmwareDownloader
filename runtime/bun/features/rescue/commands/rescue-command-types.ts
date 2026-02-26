import type { RescueQdlStorage } from '../../../../shared/rpc.ts';
import type { PreparedFastbootCommand } from '../fastboot-parser.ts';

export type PreparedFastbootRescueCommand = PreparedFastbootCommand & {
  tool: 'fastboot';
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
  | PreparedFastbootRescueCommand
  | PreparedEdlFirehoseCommand
  | PreparedUnisocPacCommand;
