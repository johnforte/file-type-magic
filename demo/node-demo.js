const { createReadStream } = require("node:fs");
const { Readable } = require("node:stream");

const {
  detectFileTypeFromStream,
  isSupportedFileFromStream,
  matchesFileTypeFromStream,
  requiredBytesForDetection,
} = require("file-type-magic");

async function main() {
  const [filePath, expectedType] = process.argv.slice(2);

  if (!filePath) {
    const sampleBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    console.log("No file path provided. Running the streamed in-memory PNG sample instead.\n");
    console.log(`stream prefix bytes: ${requiredBytesForDetection}`);
    console.log(`detected: ${await detectFileTypeFromStream(Readable.from([sampleBytes])) ?? "unknown"}`);
    console.log(`supported: ${await isSupportedFileFromStream(Readable.from([sampleBytes]))}`);
    console.log(`matches png: ${await matchesFileTypeFromStream(Readable.from([sampleBytes]), "png")}`);
    console.log("\nUsage: node demo/node-demo.js <file-path> [expected-type]");
    return;
  }

  const detectedType = await detectFileTypeFromStream(createReadStream(filePath));

  console.log(`file: ${filePath}`);
  console.log(`stream prefix bytes: ${requiredBytesForDetection}`);
  console.log(`detected: ${detectedType ?? "unknown"}`);
  console.log(`supported: ${await isSupportedFileFromStream(createReadStream(filePath))}`);

  if (expectedType) {
    console.log(
      `matches ${expectedType}: ${await matchesFileTypeFromStream(createReadStream(filePath), expectedType)}`,
    );
  }
}

main().catch((error) => {
  console.error("Failed to run the Node consumer demo.");
  console.error(error);
  process.exitCode = 1;
});
