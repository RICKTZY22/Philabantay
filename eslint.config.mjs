import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * Until 2026-08-01 `npm run lint` was `tsc --noEmit` over `apps/api` alone,
 * which is what `npm run typecheck` already does, and it never looked at
 * `apps/web` at all. Every "lint clean" line in the session log up to that date
 * means "the API typechecks" and nothing more.
 *
 * The rules that earn their place here are the ones a typechecker cannot see:
 * `react-hooks/rules-of-hooks` and `exhaustive-deps` over ~11.7k lines of React
 * that have no component tests behind them.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      'docs/**',
      'supabase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase already marks deliberate non-uses with a leading
      // underscore, and Express *requires* them: it detects error middleware by
      // arity, so `(error, req, res, _next)` must keep its fourth parameter.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts', '*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests reach for fixture shapes the runtime never sees.
    files: ['**/test/**/*.ts', '**/*.test.ts', '**/scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
