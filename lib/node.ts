import { createRequire } from "node:module";

import {
  readStreamPrefix,
  requiredBytesForDetection,
  type FileTypeMagicStreamSource,
} from "./shared";

export { requiredBytesForDetection };

type FileTypeMagicApi = {
  detectFileType(bytes: Uint8Array): string | undefined;
  isSupportedFile(bytes: Uint8Array): boolean;
  matchesFileType(bytes: Uint8Array, expected: string): boolean;
};

const load =
  typeof module !== "undefined" && typeof module.require === "function"
    ? module.require.bind(module)
    : createRequire(import.meta.url);
const nodeBinding = load("./node-runtime/file_type_magic.js") as FileTypeMagicApi;

export const detectFileType = (bytes: Uint8Array): string | undefined => {
  return nodeBinding.detectFileType(bytes);
};

export const detectFileTypeFromStream = async (
  source: FileTypeMagicStreamSource,
): Promise<string | undefined> => {
  return detectFileType(await readStreamPrefix(source));
};

export const isSupportedFile = (bytes: Uint8Array): boolean => {
  return nodeBinding.isSupportedFile(bytes);
};

export const isSupportedFileFromStream = async (
  source: FileTypeMagicStreamSource,
): Promise<boolean> => {
  return isSupportedFile(await readStreamPrefix(source));
};

export const matchesFileType = (bytes: Uint8Array, expected: string): boolean => {
  return nodeBinding.matchesFileType(bytes, expected);
};

export const matchesFileTypeFromStream = async (
  source: FileTypeMagicStreamSource,
  expected: string,
): Promise<boolean> => {
  return matchesFileType(await readStreamPrefix(source), expected);
};

export type { FileTypeMagicStreamSource };

export default {
  requiredBytesForDetection,
  detectFileType,
  detectFileTypeFromStream,
  isSupportedFile,
  isSupportedFileFromStream,
  matchesFileType,
  matchesFileTypeFromStream,
};
