import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  isKnownFileTypeCode,
  labelForFileTypeCode,
  normalizeFileTypeCode,
  readStreamPrefix,
  requiredBytesForDetection,
  type FileTypeMagicStreamSource,
} from "./shared";

export { requiredBytesForDetection };

type FileTypeMagicWasmExports = {
  memory: WebAssembly.Memory;
  __wbindgen_externrefs: WebAssembly.Table;
  __wbindgen_start(): void;
  inputBufferCapacity(): number;
  inputBufferPointer(): number;
  detectFileTypeCodeFromInput(length: number): number;
};

const nodeWasmPath =
  typeof __dirname === "string"
    ? `${__dirname}/node-runtime/file_type_magic_bg.wasm`
    : fileURLToPath(new URL(/* @vite-ignore */ "./node-runtime/file_type_magic_bg.wasm", import.meta.url));

let nodeWasm: FileTypeMagicWasmExports;

function initializeExternrefTable(): void {
  const table = nodeWasm.__wbindgen_externrefs;
  const offset = table.grow(4);

  table.set(0, undefined);
  table.set(offset + 0, undefined);
  table.set(offset + 1, null);
  table.set(offset + 2, true);
  table.set(offset + 3, false);
}

const nodeWasmModule = new WebAssembly.Module(readFileSync(nodeWasmPath));
nodeWasm = new WebAssembly.Instance(nodeWasmModule, {
  "./file_type_magic_bg.js": {
    __wbindgen_init_externref_table: initializeExternrefTable,
  },
}).exports as unknown as FileTypeMagicWasmExports;
nodeWasm.__wbindgen_start();

const inputBufferPointer = nodeWasm.inputBufferPointer();
const inputBufferCapacity = nodeWasm.inputBufferCapacity();
let cachedInputMemory: Uint8Array | undefined;

function getInputMemory(): Uint8Array {
  if (cachedInputMemory === undefined || cachedInputMemory.buffer !== nodeWasm.memory.buffer) {
    cachedInputMemory = new Uint8Array(nodeWasm.memory.buffer);
  }

  return cachedInputMemory;
}

function detectFileTypeCode(bytes: Uint8Array): number {
  const length = Math.min(bytes.byteLength, inputBufferCapacity);
  getInputMemory().set(bytes.subarray(0, length), inputBufferPointer);
  return nodeWasm.detectFileTypeCodeFromInput(length);
}

export const detectFileType = (bytes: Uint8Array): string | undefined => {
  return labelForFileTypeCode(detectFileTypeCode(bytes));
};

export const detectFileTypeFromStream = async (
  source: FileTypeMagicStreamSource,
): Promise<string | undefined> => {
  return detectFileType(await readStreamPrefix(source));
};

export const isSupportedFile = (bytes: Uint8Array): boolean => {
  return isKnownFileTypeCode(detectFileTypeCode(bytes));
};

export const isSupportedFileFromStream = async (
  source: FileTypeMagicStreamSource,
): Promise<boolean> => {
  return isSupportedFile(await readStreamPrefix(source));
};

export const matchesFileType = (bytes: Uint8Array, expected: string): boolean => {
  const expectedCode = normalizeFileTypeCode(expected);
  return expectedCode !== undefined && detectFileTypeCode(bytes) === expectedCode;
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
