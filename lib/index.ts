import {
  readStreamPrefix,
  requiredBytesForDetection,
  type FileTypeMagicStreamSource,
} from "./shared";
import * as wasmBinding from "../pkg/browser/file_type_magic.js";

export { requiredBytesForDetection };

export const detectFileType = (bytes: Uint8Array): string | undefined => {
  return wasmBinding.detectFileType(bytes);
};

export const detectFileTypeFromStream = async (
  source: FileTypeMagicStreamSource,
): Promise<string | undefined> => {
  return detectFileType(await readStreamPrefix(source));
};

export const isSupportedFile = (bytes: Uint8Array): boolean => {
  return wasmBinding.isSupportedFile(bytes);
};

export const isSupportedFileFromStream = async (
  source: FileTypeMagicStreamSource,
): Promise<boolean> => {
  return isSupportedFile(await readStreamPrefix(source));
};

export const matchesFileType = (bytes: Uint8Array, expected: string): boolean => {
  return wasmBinding.matchesFileType(bytes, expected);
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
