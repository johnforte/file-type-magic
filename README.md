# file-type-magic

`file-type-magic` is a small npm package scaffold backed by a Rust WebAssembly module. It checks file types from raw bytes using well-known file signatures.

## What it does

- Detects a file type from a byte buffer
- Checks whether a buffer matches an expected file type
- Runs the detection logic inside Rust and ships it through npm as WASM

## Supported types

- `png`
- `jpeg`
- `gif`
- `pdf`
- `zip`
- `webp`
- `wasm`
- `gzip`
- `bmp`
- `tar`

`detectFileType` returns the canonical labels above. `matchesFileType` also accepts common aliases, dot-prefixed extensions, and MIME types such as `jpg`, `.png`, `image/jpeg`, and `application/x-gzip`.

## Prerequisites

Install the wasm target and `wasm-pack` if they are not already available:

```bash
rustup target add wasm32-unknown-unknown
cargo +stable install wasm-pack
```

## Build

```bash
npm run build
```

This generates the published library files in `dist/` and the internal browser wasm-pack build artifacts in `pkg/browser`.

The published library surface lives in `dist/`:

- `dist/index.mjs` for browser/bundler consumers
- `dist/node.mjs` and `dist/node.cjs` for Node consumers
- `dist/node-runtime/` for the Node wasm runtime files

The npm scripts prepend the `rustup` toolchain binary directory to `PATH` so `cargo` and `rustc` stay on the same toolchain, even on systems that also have a Homebrew Rust install.

## Test

```bash
npm test
```

## Usage

The root package export selects the right build for the runtime:

- Node `require()` resolves to the Node wrapper
- Node `import` resolves to the Node ESM wrapper
- Browser/bundler `import` resolves to the Vite-packaged browser build

Explicit subpaths are also available:

- `file-type-magic/node`
- `file-type-magic/browser`

### CommonJS

```js
const {
  detectFileType,
  detectFileTypeFromStream,
  matchesFileType,
  isSupportedFile,
  requiredBytesForDetection,
} = require("file-type-magic");

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

console.log(detectFileType(pngBytes));
console.log(matchesFileType(pngBytes, "png"));
console.log(isSupportedFile(pngBytes));
```

### CommonJS stream

```js
const fs = require("node:fs");
const { detectFileTypeFromStream, requiredBytesForDetection } = require("file-type-magic");

(async () => {
  console.log(requiredBytesForDetection);
  console.log(await detectFileTypeFromStream(fs.createReadStream("./file.png")));
})();
```

### ESM

```js
import {
  detectFileType,
  matchesFileType,
  isSupportedFile,
} from "file-type-magic";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

console.log(detectFileType(pngBytes));
console.log(matchesFileType(pngBytes, "png"));
console.log(isSupportedFile(pngBytes));
```

### Browser stream

```js
import { detectFileTypeFromStream, requiredBytesForDetection } from "file-type-magic";

const fileInput = document.querySelector("input[type=file]");

fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files ?? [];

  if (!file) {
    return;
  }

  const kind = await detectFileTypeFromStream(file.stream());
  console.log(requiredBytesForDetection, kind);
});
```

## API

### `detectFileType(bytes: Uint8Array): string | undefined`

Returns the detected file type if the signature is known.

### `detectFileTypeFromStream(source: ReadableStream | AsyncIterable): Promise<string | undefined>`

Reads only the first `requiredBytesForDetection` bytes from a binary stream and detects the file type.

### `matchesFileType(bytes: Uint8Array, expected: string): boolean`

Returns `true` when the detected type matches `expected`, including canonical labels, common aliases, dot-prefixed extensions, and MIME types.

### `matchesFileTypeFromStream(source: ReadableStream | AsyncIterable, expected: string): Promise<boolean>`

Reads only the first `requiredBytesForDetection` bytes from a binary stream and compares the detected type.

### `isSupportedFile(bytes: Uint8Array): boolean`

Returns `true` when the byte buffer matches any supported signature.

### `isSupportedFileFromStream(source: ReadableStream | AsyncIterable): Promise<boolean>`

Reads only the first `requiredBytesForDetection` bytes from a binary stream and reports whether the signature is supported.

### `requiredBytesForDetection: number`

The number of bytes the stream helpers need to read to cover all supported signatures.
