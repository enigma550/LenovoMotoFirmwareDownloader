import type { RescueQdlStorage } from '../../../../shared/rpc.ts';
import type { PreparedRescueCommand } from '../commands/rescue-command-types.ts';
import type { RescueRecipeHints } from '../recipe-resolver.ts';

export type RescuePlannerId = 'edl-firehose' | 'xml-fastboot' | 'script-fastboot' | 'unisoc-pac';

export type RescueCommandPlanContext = {
  workDir: string;
  dataReset: 'yes' | 'no';
  qdlStorage: RescueQdlStorage;
  qdlSerial?: string;
  recipeHints?: RescueRecipeHints;
  extractedFiles: string[];
  fileIndex: Map<string, string[]>;
};

export type RescueCommandPlanCandidate = {
  plannerId: RescuePlannerId;
  plannerPriority: number;
  commandSource: string;
  sourceFileName: string;
  commands: PreparedRescueCommand[];
  warnings: string[];
};
