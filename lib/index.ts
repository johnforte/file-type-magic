import {
  isKnownFileTypeCode,
  labelForFileTypeCode,
  normalizeFileTypeCode,
  readStreamPrefix,
  requiredBytesForDetection,
  type FileTypeMagicStreamSource,
} from "./shared";

type FileTypeMagicWasmExports = {
  memory: WebAssembly.Memory;
  __wbindgen_externrefs: WebAssembly.Table;
  __wbindgen_start(): void;
  inputBufferCapacity(): number;
  inputBufferPointer(): number;
  detectFileTypeCodeFromInput(length: number): number;
};

const wasmUrl = new URL("../pkg/browser/file_type_magic_bg.wasm", import.meta.url);
let browserWasm: FileTypeMagicWasmExports;

function initializeExternrefTable(): void {
  const table = browserWasm.__wbindgen_externrefs;
  const offset = table.grow(4);

  table.set(0, undefined);
  table.set(offset + 0, undefined);
  table.set(offset + 1, null);
  table.set(offset + 2, true);
  table.set(offset + 3, false);
}

async function loadBrowserWasm(): Promise<FileTypeMagicWasmExports> {
  const imports = {
    "./file_type_magic_bg.js": {
      __wbindgen_init_externref_table: initializeExternrefTable,
    },
  };
  const response = await fetch(wasmUrl);
  let instance: WebAssembly.Instance;

  if ("instantiateStreaming" in WebAssembly) {
    const fallbackResponse = response.clone();

    try {
      ({ instance } = await WebAssembly.instantiateStreaming(response, imports));
    } catch {
      ({ instance } = await WebAssembly.instantiate(await fallbackResponse.arrayBuffer(), imports));
    }
  } else {
    ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), imports));
  }

  browserWasm = instance.exports as unknown as FileTypeMagicWasmExports;
  browserWasm.__wbindgen_start();
  return browserWasm;
}

const wasm = await loadBrowserWasm();
const inputBufferPointer = wasm.inputBufferPointer();
const inputBufferCapacity = wasm.inputBufferCapacity();
let cachedInputMemory: Uint8Array | undefined;

function getInputMemory(): Uint8Array {
  if (cachedInputMemory === undefined || cachedInputMemory.buffer !== wasm.memory.buffer) {
    cachedInputMemory = new Uint8Array(wasm.memory.buffer);
  }

  return cachedInputMemory;
}

function detectFileTypeCode(bytes: Uint8Array): number {
  const length = Math.min(bytes.byteLength, inputBufferCapacity);
  getInputMemory().set(bytes.subarray(0, length), inputBufferPointer);
  return wasm.detectFileTypeCodeFromInput(length);
}

export { requiredBytesForDetection };

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
