// The deepest signature we currently inspect is `ustar` at offset 257.
export const requiredBytesForDetection = 262;

export type FileTypeMagicStreamChunk = Uint8Array | ArrayBuffer | ArrayBufferView;

export type FileTypeMagicStreamSource =
  | ReadableStream<FileTypeMagicStreamChunk>
  | AsyncIterable<FileTypeMagicStreamChunk>;

function toUint8Array(chunk: FileTypeMagicStreamChunk): Uint8Array {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }

  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }

  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }

  throw new TypeError("Stream must yield binary chunks.");
}

function copyChunk(buffer: Uint8Array, offset: number, chunk: FileTypeMagicStreamChunk): number {
  const view = toUint8Array(chunk);
  const remaining = buffer.byteLength - offset;
  const length = Math.min(view.byteLength, remaining);

  buffer.set(view.subarray(0, length), offset);

  return offset + length;
}

function isReadableStream(source: FileTypeMagicStreamSource): source is ReadableStream<FileTypeMagicStreamChunk> {
  return typeof source === "object" && source !== null && "getReader" in source;
}

function isAsyncIterable(source: FileTypeMagicStreamSource): source is AsyncIterable<FileTypeMagicStreamChunk> {
  return typeof source === "object" && source !== null && Symbol.asyncIterator in source;
}

async function readPrefixFromReadableStream(
  stream: ReadableStream<FileTypeMagicStreamChunk>,
  maxBytes: number,
): Promise<Uint8Array> {
  const buffer = new Uint8Array(maxBytes);
  const reader = stream.getReader();
  let offset = 0;

  try {
    while (offset < maxBytes) {
      const { done, value } = await reader.read();

      if (done || value === undefined) {
        break;
      }

      offset = copyChunk(buffer, offset, value);
    }
  } finally {
    reader.releaseLock();
  }

  return buffer.subarray(0, offset);
}

async function readPrefixFromAsyncIterable(
  source: AsyncIterable<FileTypeMagicStreamChunk>,
  maxBytes: number,
): Promise<Uint8Array> {
  const buffer = new Uint8Array(maxBytes);
  let offset = 0;

  for await (const chunk of source) {
    offset = copyChunk(buffer, offset, chunk);

    if (offset >= maxBytes) {
      break;
    }
  }

  return buffer.subarray(0, offset);
}

export async function readStreamPrefix(
  source: FileTypeMagicStreamSource,
  maxBytes: number = requiredBytesForDetection,
): Promise<Uint8Array> {
  if (isReadableStream(source)) {
    return readPrefixFromReadableStream(source, maxBytes);
  }

  if (isAsyncIterable(source)) {
    return readPrefixFromAsyncIterable(source, maxBytes);
  }

  throw new TypeError("Expected a ReadableStream or AsyncIterable of binary chunks.");
}
