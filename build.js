/* eslint-disable @typescript-eslint/no-var-requires */
const {
  NodeGlobalsPolyfillPlugin
} = require('@esbuild-plugins/node-globals-polyfill');
const { build } = require('esbuild');
const { readFileSync, writeFileSync } = require('fs');

modifyEsbuildNodeGlobalsPolyfillToWorkWithCFWorkers();

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.mjs',
  format: 'esm',
  minify: true,
  plugins: [
    NodeGlobalsPolyfillPlugin({
      buffer: true
    })
  ],
  logLevel: 'info'
});

function modifyEsbuildNodeGlobalsPolyfillToWorkWithCFWorkers() {
  let process = readFileSync(
    './node_modules/@esbuild-plugins/node-globals-polyfill/process.js',
    { encoding: 'utf-8' }
  );
  process = process.replace(/global\./g, '');
  writeFileSync(
    './node_modules/@esbuild-plugins/node-globals-polyfill/process.js',
    process
  );

  let buffer = readFileSync(
    './node_modules/@esbuild-plugins/node-globals-polyfill/Buffer.js',
    { encoding: 'utf-8' }
  );
  buffer = buffer
    .replace(
      'Buffer.TYPED_ARRAY_SUPPORT =',
      'Buffer.TYPED_ARRAY_SUPPORT = true;'
    )
    .replace(/global\./, '//');
  writeFileSync(
    './node_modules/@esbuild-plugins/node-globals-polyfill/Buffer.js',
    buffer
  );
}
