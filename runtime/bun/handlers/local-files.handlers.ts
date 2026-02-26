import {
  attachLocalRecipeFromModel,
  attachLocalRecipeMetadata,
  deleteLocalFile,
  listLocalDownloadedFiles,
} from '../local-downloads.ts';
import type { BunRpcRequestHandlers } from './types.ts';

export function createLocalFilesHandlers(): Pick<
  BunRpcRequestHandlers,
  | 'listLocalDownloadedFiles'
  | 'attachLocalRecipeFromModel'
  | 'attachLocalRecipeMetadata'
  | 'deleteLocalFile'
> {
  return {
    listLocalDownloadedFiles: async () => {
      return listLocalDownloadedFiles();
    },
    attachLocalRecipeFromModel: async ({ filePath, fileName, modelName, marketName, category }) => {
      return attachLocalRecipeFromModel({
        filePath,
        fileName,
        modelName,
        marketName,
        category,
      });
    },
    attachLocalRecipeMetadata: async ({
      filePath,
      fileName,
      recipeUrl,
      romName,
      romUrl,
      publishDate,
      romMatchIdentifier,
      selectedParameters,
      source,
    }) => {
      return attachLocalRecipeMetadata({
        filePath,
        fileName,
        recipeUrl,
        romName,
        romUrl,
        publishDate,
        romMatchIdentifier,
        selectedParameters,
        source,
      });
    },
    deleteLocalFile: async ({ filePath }: { filePath: string }) => {
      return deleteLocalFile({ filePath });
    },
  };
}
