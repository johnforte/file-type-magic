import {
  detectFileType,
  detectFileTypeFromStream,
  requiredBytesForDetection,
} from "../dist/node.mjs";
import { fileTypeFromBuffer, fileTypeFromStream } from "file-type";
import fileTypeChecker from "file-type-checker";

const encoder = new TextEncoder();
const DEFAULT_BUFFER_ITERATIONS = 50_000;
const DEFAULT_STREAM_ITERATIONS = 5_000;
const DEFAULT_WARMUP_ITERATIONS = 1_000;
const DEFAULT_CHUNK_SIZE = 64;
const SAMPLE_SIZE = 512;
const UNKNOWN_LABEL = "unknown";
const fileTypeCheckerUnsupportedLabels = new Set(["wasm", "gzip", "tar"]);

const extensionAliases = new Map([
  ["jpg", "jpeg"],
  ["gz", "gzip"],
]);

function readPositiveIntegerFlag(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((entry) => entry.startsWith(prefix));

  if (!argument) {
    return fallback;
  }

  const value = Number.parseInt(argument.slice(prefix.length), 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`Expected --${name} to be a positive integer.`);
  }

  return value;
}

function normalizeLabel(label) {
  if (!label) {
    return undefined;
  }

  return extensionAliases.get(label) ?? label;
}

function padSample(signatureBytes) {
  const bytes = new Uint8Array(SAMPLE_SIZE);
  bytes.set(signatureBytes, 0);
  return bytes;
}

function writeAscii(bytes, offset, value) {
  bytes.set(encoder.encode(value), offset);
}

function createTarSample() {
  const bytes = new Uint8Array(SAMPLE_SIZE);

  writeAscii(bytes, 0, "demo.txt");
  writeAscii(bytes, 100, "0000777\0");
  writeAscii(bytes, 108, "0000000\0");
  writeAscii(bytes, 116, "0000000\0");
  writeAscii(bytes, 124, "00000000000\0");
  writeAscii(bytes, 136, "00000000000\0");
  writeAscii(bytes, 148, "        ");
  writeAscii(bytes, 156, "0");
  writeAscii(bytes, 257, "ustar\0");
  writeAscii(bytes, 263, "00");

  let checksum = 0;

  for (const value of bytes) {
    checksum += value;
  }

  writeAscii(bytes, 148, `${checksum.toString(8).padStart(6, "0")}\0 `);

  return bytes;
}

function createPngSample() {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhfoAAAAASUVORK5CYII=",
      "base64",
    ),
  );
}

function chunkBytes(bytes, chunkSize) {
  const chunks = [];

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)));
  }

  return chunks;
}

function createReadableStream(chunks) {
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }

      controller.enqueue(chunks[index]);
      index += 1;
    },
  });
}

function getExpectedResult(label) {
  return label === UNKNOWN_LABEL ? undefined : label;
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatRatio(value) {
  return `${formatDecimal(value)}x`;
}

function describeRelativeSpeed(left, right) {
  if (left.operationsPerSecond === right.operationsPerSecond) {
    return `${left.name} and ${right.name} measured the same throughput.`;
  }

  const [faster, slower] =
    left.operationsPerSecond > right.operationsPerSecond ? [left, right] : [right, left];

  return `${faster.name} is ${formatRatio(faster.operationsPerSecond / slower.operationsPerSecond)} faster than ${slower.name}.`;
}

function describeRelativeSpeeds(rows) {
  if (rows.length <= 1) {
    return "Need at least two implementations for a throughput comparison.";
  }

  const sortedRows = [...rows].sort(
    (left, right) => right.operationsPerSecond - left.operationsPerSecond,
  );

  return sortedRows
    .slice(1)
    .map((row) => describeRelativeSpeed(sortedRows[0], row))
    .join(" ");
}

function printTable(title, rows) {
  const headers = ["Implementation", "Iterations", "Total ms", "Avg us/op", "Ops/sec"];
  const tableRows = rows.map((row) => [
    row.name,
    formatInteger(row.iterations),
    formatDecimal(row.totalMilliseconds),
    formatDecimal(row.averageMicroseconds),
    formatInteger(row.operationsPerSecond),
  ]);
  const widths = headers.map((header, index) => {
    return Math.max(header.length, ...tableRows.map((row) => row[index].length));
  });

  console.log(`\n${title}`);
  console.log(headers.map((header, index) => header.padEnd(widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));

  for (const row of tableRows) {
    console.log(row.map((value, index) => value.padEnd(widths[index])).join("  "));
  }
}

function summarize(name, iterations, elapsedNanoseconds, checksum) {
  const totalMilliseconds = elapsedNanoseconds / 1e6;
  const averageNanoseconds = elapsedNanoseconds / iterations;

  return {
    name,
    iterations,
    totalMilliseconds,
    averageMicroseconds: averageNanoseconds / 1e3,
    operationsPerSecond: 1e9 / averageNanoseconds,
    checksum,
  };
}

function detectFileTypeWithChecker(bytes) {
  return normalizeLabel(fileTypeChecker.detectFile(bytes)?.extension);
}

async function runBenchmark(name, iterations, detect, benchmarkSamples = samples) {
  let checksum = 0;
  const startedAt = process.hrtime.bigint();

  for (let index = 0; index < iterations; index += 1) {
    const sample = benchmarkSamples[index % benchmarkSamples.length];
    const label = await detect(sample);
    checksum += label?.length ?? 0;
  }

  const elapsedNanoseconds = Number(process.hrtime.bigint() - startedAt);
  return summarize(name, iterations, elapsedNanoseconds, checksum);
}

async function warmup(iterations) {
  if (iterations <= 0) {
    return;
  }

  await runBenchmark("warmup wasm buffer", iterations, async (sample) => detectFileType(sample.bytes), bufferSamples);
  await runBenchmark("warmup file-type buffer", iterations, async (sample) => {
    return normalizeLabel((await fileTypeFromBuffer(sample.bytes))?.ext);
  }, bufferSamples);
  await runBenchmark("warmup file-type-checker buffer", iterations, async (sample) => {
    return detectFileTypeWithChecker(sample.bytes);
  }, bufferSamples);
  await runBenchmark("warmup wasm stream", iterations, async (sample) => {
    return detectFileTypeFromStream(createReadableStream(sample.chunks));
  }, samples);
  await runBenchmark("warmup file-type stream", iterations, async (sample) => {
    return normalizeLabel((await fileTypeFromStream(createReadableStream(sample.chunks)))?.ext);
  }, samples);
}

async function verifySamples() {
  for (const sample of samples) {
    const expected = getExpectedResult(sample.label);
    const wasmBuffer = detectFileType(sample.bytes);
    const fileTypeBuffer = normalizeLabel((await fileTypeFromBuffer(sample.bytes))?.ext);
    const fileTypeCheckerBuffer = !fileTypeCheckerUnsupportedLabels.has(sample.label)
      ? detectFileTypeWithChecker(sample.bytes)
      : undefined;
    const wasmStream = await detectFileTypeFromStream(createReadableStream(sample.chunks));
    const fileTypeStream = normalizeLabel((await fileTypeFromStream(createReadableStream(sample.chunks)))?.ext);

    if (wasmBuffer !== expected) {
      throw new Error(`WASM buffer detection failed for ${sample.label}: expected ${expected ?? "undefined"}, got ${wasmBuffer ?? "undefined"}.`);
    }

    if (fileTypeBuffer !== expected) {
      throw new Error(`file-type buffer detection failed for ${sample.label}: expected ${expected ?? "undefined"}, got ${fileTypeBuffer ?? "undefined"}.`);
    }

    if (!fileTypeCheckerUnsupportedLabels.has(sample.label) && fileTypeCheckerBuffer !== expected) {
      throw new Error(
        `file-type-checker buffer detection failed for ${sample.label}: expected ${expected ?? "undefined"}, got ${fileTypeCheckerBuffer ?? "undefined"}.`,
      );
    }

    if (wasmStream !== expected) {
      throw new Error(`WASM stream detection failed for ${sample.label}: expected ${expected ?? "undefined"}, got ${wasmStream ?? "undefined"}.`);
    }

    if (fileTypeStream !== expected) {
      throw new Error(`file-type stream detection failed for ${sample.label}: expected ${expected ?? "undefined"}, got ${fileTypeStream ?? "undefined"}.`);
    }
  }
}

const bufferIterations = readPositiveIntegerFlag("buffer-iterations", DEFAULT_BUFFER_ITERATIONS);
const streamIterations = readPositiveIntegerFlag("stream-iterations", DEFAULT_STREAM_ITERATIONS);
const warmupIterations = readPositiveIntegerFlag("warmup", DEFAULT_WARMUP_ITERATIONS);
const chunkSize = readPositiveIntegerFlag("chunk-size", DEFAULT_CHUNK_SIZE);

const samples = [
  { label: "png", bytes: createPngSample() },
  { label: "jpeg", bytes: padSample([0xff, 0xd8, 0xff, 0xdb]) },
  { label: "gif", bytes: padSample([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) },
  { label: "pdf", bytes: padSample([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]) },
  { label: "zip", bytes: padSample([0x50, 0x4b, 0x03, 0x04]) },
  {
    label: "webp",
    bytes: padSample([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
  },
  { label: "wasm", bytes: padSample([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]) },
  { label: "gzip", bytes: padSample([0x1f, 0x8b, 0x08, 0x08]) },
  { label: "bmp", bytes: padSample([0x42, 0x4d, 0x46, 0x00]) },
  { label: "tar", bytes: createTarSample() },
  { label: UNKNOWN_LABEL, bytes: padSample([0x13, 0x37, 0xaa, 0x55, 0x42, 0x24, 0x90, 0xef]) },
].map((sample) => ({
  ...sample,
  chunks: chunkBytes(sample.bytes, chunkSize),
}));
const bufferSamples = samples.filter((sample) => !fileTypeCheckerUnsupportedLabels.has(sample.label));
const bufferSampleSizes = bufferSamples.map((sample) => sample.bytes.byteLength);
const sampleSizes = samples.map((sample) => sample.bytes.byteLength);

async function main() {
  console.log("file-type-magic vs file-type vs file-type-checker benchmark");
  console.log(`Buffer samples: ${bufferSamples.map((sample) => sample.label).join(", ")}`);
  console.log(`Stream samples: ${samples.map((sample) => sample.label).join(", ")}`);
  console.log(`Buffer sample size range: ${Math.min(...bufferSampleSizes)}-${Math.max(...bufferSampleSizes)} bytes`);
  console.log(`Stream sample size range: ${Math.min(...sampleSizes)}-${Math.max(...sampleSizes)} bytes`);
  console.log(`WASM stream prefix bytes: ${requiredBytesForDetection}`);
  console.log(`Chunk size: ${chunkSize}`);
  console.log("file-type-checker does not expose a stream API, so it is benchmarked only for buffer detection.");

  await verifySamples();
  await warmup(warmupIterations);

  const wasmBuffer = await runBenchmark("WASM detectFileType", bufferIterations, async (sample) => {
    return detectFileType(sample.bytes);
  }, bufferSamples);
  const fileTypeBuffer = await runBenchmark("file-type fromBuffer", bufferIterations, async (sample) => {
    return normalizeLabel((await fileTypeFromBuffer(sample.bytes))?.ext);
  }, bufferSamples);
  const fileTypeCheckerBuffer = await runBenchmark("file-type-checker detectFile", bufferIterations, async (sample) => {
    return detectFileTypeWithChecker(sample.bytes);
  }, bufferSamples);

  if (
    wasmBuffer.checksum !== fileTypeBuffer.checksum ||
    wasmBuffer.checksum !== fileTypeCheckerBuffer.checksum
  ) {
    throw new Error("Buffer benchmark checksum mismatch between implementations.");
  }

  const wasmStream = await runBenchmark("WASM detectFileTypeFromStream", streamIterations, async (sample) => {
    return detectFileTypeFromStream(createReadableStream(sample.chunks));
  });
  const fileTypeStream = await runBenchmark("file-type fromStream", streamIterations, async (sample) => {
    return normalizeLabel((await fileTypeFromStream(createReadableStream(sample.chunks)))?.ext);
  });

  if (wasmStream.checksum !== fileTypeStream.checksum) {
    throw new Error("Stream benchmark checksum mismatch between implementations.");
  }

  printTable("Buffer Benchmark", [wasmBuffer, fileTypeBuffer, fileTypeCheckerBuffer]);
  console.log(describeRelativeSpeeds([wasmBuffer, fileTypeBuffer, fileTypeCheckerBuffer]));

  printTable("Stream Benchmark", [wasmStream, fileTypeStream]);
  console.log(describeRelativeSpeeds([wasmStream, fileTypeStream]));
  console.log("\nUse --buffer-iterations=... --stream-iterations=... --warmup=... --chunk-size=... to tune the run.");
}

main().catch((error) => {
  console.error("Failed to run benchmark.");
  console.error(error);
  process.exitCode = 1;
});
