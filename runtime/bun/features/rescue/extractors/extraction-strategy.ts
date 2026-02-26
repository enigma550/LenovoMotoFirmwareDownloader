export type ExtractionContext = {
  packagePath: string;
  extractDir: string;
  extension: string;
  platform: NodeJS.Platform;
  workingDirectory: string;
};

export type RunExtractionStrategyOptions = {
  context: ExtractionContext;
  signal?: AbortSignal;
  onProcess?: (process: Bun.Subprocess | null) => void;
};

export type ExtractionAttemptResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export type ExtractionStrategy = {
  name: string;
  allowWarningExitCodes?: number[];
  supports: (context: ExtractionContext) => boolean;
  buildCommand: (context: ExtractionContext) => string[];
};
