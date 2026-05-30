import _ from 'lodash';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import json from '@rollup/plugin-json';
import dts from 'rollup-plugin-dts';
import scss from 'rollup-plugin-scss';

export const rollupConfig = {
  input: {
    index: 'src/index',
  },
  external: [
    /node_modules/
  ],
  makeAbsoluteExternalsRelative: true,
};

const rollupPlugins = (exts) => [
  typescript({
    declaration: false,
    exclude: ['tests/**/*'],
    moduleSuffixes: exts,
  }),
  babel({
    babelrc: false,
    exclude: 'node_modules/**',
    babelHelpers: 'bundled',
  }),
  commonjs({
    transformMixedEsModules: true,
  }),
  json(),
];

const moduleSuffixes = {
  '.server': ['.server', '.web', ''],
  '': ['.web', ''],
};

export default [
  ..._.map(moduleSuffixes, (exts, suffix) => ({
    ...rollupConfig,
    output: [
      {
        entryFileNames: `[name]${suffix}.js`,
        chunkFileNames: `internals/[name]-[hash]${suffix}.js`,
        dir: './dist',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        entryFileNames: `[name]${suffix}.mjs`,
        chunkFileNames: `internals/[name]-[hash]${suffix}.mjs`,
        dir: './dist',
        format: 'es',
        sourcemap: true,
      },
    ],
    plugins: _.compact([
      resolve({
        extensions: [
          ...exts.flatMap(x => [`${x}.tsx`, `${x}.jsx`]),
          ...exts.flatMap(x => [`${x}.ts`, `${x}.mjs`, `${x}.js`]),
        ]
      }),
      suffix === '' && scss({ fileName: 'index.web.css' }),
      ...rollupPlugins(exts),
    ]),
  })),
  {
    ...rollupConfig,
    output: [
      {
        entryFileNames: '[name].d.ts',
        chunkFileNames: 'internals/[name]-[hash].d.ts',
        dir: './dist',
        format: 'es',
        sourcemap: true,
      },
    ],
    external: [
      /\.css$/,
      /\.scss$/,
      /\.sass$/,
      ...rollupConfig.external,
    ],
    plugins: [
      resolve({
        extensions: ['.tsx', '.jsx', '.ts', '.mjs', '.js']
      }),
      dts()
    ],
  },
];