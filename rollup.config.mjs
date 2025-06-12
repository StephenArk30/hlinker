import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/hlinker.js',
    format: 'cjs',
    banner: '#!/usr/bin/env node',
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    json(),
    commonjs(),
    typescript(),
    replace({
      __VERSION__: JSON.stringify(pkg.version),
      preventAssignment: true,
    }),
  ],
};
