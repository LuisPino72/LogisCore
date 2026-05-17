import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'security/detect-object-injection': 'off',
    },
  },
  {
    ignores: ['dist/**', '.turbo/**', '**/*.d.ts'],
  },
);
