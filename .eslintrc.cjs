// ESLint config for cfgforge monorepo — enforces package layer dependencies
// Design doc: docs/plans/2026-08-24-ts-rewrite-design.md
//
// Dependency graph (only downward allowed):
//   cli / editor-core / mcp  →  context  →  value  →  data  →  schema  →  shared
//                                               ↘          ↗
//                                                i18n
//   gen  →  context
//   write  →  context

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },
  rules: {
    // shared: no imports from any other cfgforge package
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@cfgforge/*', '!@cfgforge/shared'],
            message: 'packages/shared cannot import other cfgforge packages',
          },
        ],
      },
    ],
  },
  overrides: [
    // schema: can only import shared
    {
      files: ['packages/schema/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared'],
                message: 'packages/schema can only import @cfgforge/shared',
              },
            ],
          },
        ],
      },
    },
    // data: can import schema + shared
    {
      files: ['packages/data/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared', '!@cfgforge/schema'],
                message: 'packages/data can only import @cfgforge/shared and @cfgforge/schema',
              },
            ],
          },
        ],
      },
    },
    // value: can import data + schema + i18n + shared
    {
      files: ['packages/value/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared', '!@cfgforge/schema', '!@cfgforge/data', '!@cfgforge/i18n'],
                message: 'packages/value can only import shared, schema, data, i18n',
              },
            ],
          },
        ],
      },
    },
    // i18n: can import schema + shared
    {
      files: ['packages/i18n/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared', '!@cfgforge/schema'],
                message: 'packages/i18n can only import @cfgforge/shared and @cfgforge/schema',
              },
            ],
          },
        ],
      },
    },
    // context: can import value + data + schema + i18n + shared
    {
      files: ['packages/context/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared', '!@cfgforge/schema', '!@cfgforge/data', '!@cfgforge/value', '!@cfgforge/i18n'],
                message: 'packages/context can only import shared, schema, data, value, i18n',
              },
            ],
          },
        ],
      },
    },
    // gen: can import context + i18n + shared (transitively gets all lower)
    {
      files: ['packages/gen/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared', '!@cfgforge/schema', '!@cfgforge/data', '!@cfgforge/value', '!@cfgforge/i18n', '!@cfgforge/context'],
                message: 'packages/gen can only import up to @cfgforge/context',
              },
            ],
          },
        ],
      },
    },
    // write: can import context + data + value + shared
    {
      files: ['packages/write/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared', '!@cfgforge/schema', '!@cfgforge/data', '!@cfgforge/value', '!@cfgforge/context'],
                message: 'packages/write can only import up to @cfgforge/context',
              },
            ],
          },
        ],
      },
    },
    // editor-core: can import context + write + value + shared
    {
      files: ['packages/editor-core/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared', '!@cfgforge/schema', '!@cfgforge/data', '!@cfgforge/value', '!@cfgforge/i18n', '!@cfgforge/context', '!@cfgforge/write'],
                message: 'packages/editor-core can only import up to @cfgforge/write',
              },
            ],
          },
        ],
      },
    },
    // mcp: can import editor-core + context + shared
    {
      files: ['packages/mcp/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@cfgforge/*', '!@cfgforge/shared', '!@cfgforge/context', '!@cfgforge/editor-core'],
                message: 'packages/mcp can only import @cfgforge/shared, @cfgforge/context, @cfgforge/editor-core',
              },
            ],
          },
        ],
      },
    },
    // cli: can import everything
    {
      files: ['packages/cli/src/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    // test files: no import restrictions
    {
      files: ['packages/*/src/**/*.test.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
