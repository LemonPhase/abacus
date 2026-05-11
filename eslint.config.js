import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Regex patterns for hardcoded color values
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/
const RGB_PATTERN = /\b(rgb|rgba|hsl|hsla)\(/
const COLOR_PATTERN = new RegExp(`${HEX_PATTERN.source}|${RGB_PATTERN.source}`)

/** Files where raw hex/rgb/hsl values are allowed by design system convention */
const COLOR_ALLOWED_FILES = ['src/index.css', 'src/lib/chartColors.ts']

/**
 * Custom rule: no-hardcoded-colors
 *
 * Enforces the design system rule that hex, rgb(), rgba(), hsl(), hsla()
 * color values must never appear in component, page, store, or hook files.
 * The only allowed locations are src/index.css (design tokens) and
 * src/lib/chartColors.ts (JS constants mirroring the tokens).
 */
const noHardcodedColorsRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded color values (hex, rgb, hsl) outside of designated design-token files',
    },
    messages: {
      hardcodedColor:
        'Hardcoded color value "{{value}}" found. Use a Tailwind semantic class for UI chrome (e.g. bg-primary, text-muted-foreground), or import a constant from @/lib/chartColors for chart/data-vis colors. Raw colors are only allowed in src/index.css and src/lib/chartColors.ts.',
    },
  },
  create(context) {
    const filePath = context.filename ?? context.getFilename?.() ?? ''
    // Only enforce within src/ (config files, PWA manifests, etc. may use hex legitimately)
    if (!filePath.includes('/src/')) return {}
    // Allow hardcoded colors in designated files
    if (COLOR_ALLOWED_FILES.some((f) => filePath.endsWith(f))) return {}
    // Also allow test files to reference expected hex values in assertions
    if (/\.test\.(ts|tsx)$/.test(filePath)) return {}

    function checkString(value, node) {
      if (COLOR_PATTERN.test(value)) {
        context.report({
          node,
          messageId: 'hardcodedColor',
          data: { value },
        })
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkString(node.value, node)
        }
      },
      TemplateLiteral(node) {
        // Check quasi strings (static parts of template literals)
        for (const quasi of node.quasis) {
          checkString(quasi.value.raw, quasi)
        }
      },
    }
  },
}

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'src-tauri/target']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'design-system': { rules: { 'no-hardcoded-colors': noHardcodedColorsRule } },
    },
    rules: {
      'design-system/no-hardcoded-colors': 'error',
    },
  },
  {
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
])
