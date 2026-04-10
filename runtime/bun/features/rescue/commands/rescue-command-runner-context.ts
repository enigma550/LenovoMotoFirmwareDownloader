import type { FastbootClient } from 'fastboot-bun-ts/fastboot';

export type RescueCommandExecutionContext = {
  workDir: string;
  signal: AbortSignal;
  onProcess: (process: Bun.Subprocess | null) => void;
  onConsoleLine?: (payload: {
    message: string;
    tone?: 'info' | 'verbose' | 'success' | 'warning' | 'error';
  }) => void;
  state: {
    fastbootClient?: FastbootClient;
    fastbootReconnectMatcher?: {
      serial?: string;
      idVendor?: number;
      idProduct?: number;
    };
    resolvedUnisocTool?: string;
  };
};
