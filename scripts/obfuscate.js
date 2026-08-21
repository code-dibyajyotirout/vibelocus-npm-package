const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const OUT_DIR = path.join(__dirname, '..', 'out');
const CHUNKS_DIR = path.join(OUT_DIR, '_next', 'static', 'chunks');

// Check if directory exists
if (!fs.existsSync(CHUNKS_DIR)) {
  console.error(`Chunks directory not found: ${CHUNKS_DIR}`);
  console.error('Make sure you run "npm run build" first.');
  process.exit(1);
}

// Files to exclude from obfuscation (standard Next.js / React framework code)
const EXCLUDED_PATTERNS = [
  /^framework-/,
  /^polyfills-/,
  /^webpack-/,
  /^main-/,
  /^main-app-/
];

function shouldObfuscate(filename) {
  if (!filename.endsWith('.js')) return false;
  return !EXCLUDED_PATTERNS.some(pattern => pattern.test(filename));
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

console.log('Starting client-side JavaScript obfuscation...');
let obfuscatedCount = 0;

walkDir(CHUNKS_DIR, (filePath) => {
  const filename = path.basename(filePath);
  if (!shouldObfuscate(filename)) {
    console.log(`[SKIP] Framework bundle: ${filename}`);
    return;
  }

  console.log(`[OBFUSCATE] Processing: ${path.relative(OUT_DIR, filePath)}`);
  const originalCode = fs.readFileSync(filePath, 'utf8');
  const originalSize = fs.statSync(filePath).size;

  try {
    const obfuscationResult = JavaScriptObfuscator.obfuscate(originalCode, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: false,
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: false,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayThreshold: 1.0,
      transformObjectKeys: false,
      unicodeEscapeSequence: false
    });

    const obfuscatedCode = obfuscationResult.getObfuscatedCode();
    fs.writeFileSync(filePath, obfuscatedCode, 'utf8');

    const newSize = fs.statSync(filePath).size;
    console.log(`       Size: ${(originalSize / 1024).toFixed(2)} KB -> ${(newSize / 1024).toFixed(2)} KB`);
    obfuscatedCount++;
  } catch (err) {
    console.error(`[ERROR] Failed to obfuscate ${filename}:`, err);
  }
});

console.log(`\nSuccessfully obfuscated ${obfuscatedCount} files.`);
