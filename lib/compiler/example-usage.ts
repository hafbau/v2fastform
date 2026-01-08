/**
 * Example usage of the AppSpec to Prompt compiler.
 * This demonstrates how to use the compiler in production code.
 *
 * Run with: npx tsx lib/compiler/example-usage.ts
 */

import { compileAppSpecToPrompt, UnsupportedAppSpecFeatureError } from './index'
import { PSYCH_INTAKE_TEMPLATE } from '../templates/psych-intake-lite'
import type { FastformAppSpec } from '../types/appspec'

// Example 1: Basic usage
console.log('Example 1: Basic Compilation\n')
console.log('─'.repeat(80))

try {
  const prompt = compileAppSpecToPrompt(PSYCH_INTAKE_TEMPLATE)
  console.log('✓ Compilation successful')
  console.log(`  Prompt length: ${prompt.length} characters`)
  console.log(`  Lines: ${prompt.split('\n').length}`)
  console.log('\nFirst 400 characters of prompt:')
  console.log(prompt.substring(0, 400) + '...\n')
} catch (error) {
  console.error('✗ Compilation failed:', error)
}

// Example 2: Error handling
console.log('─'.repeat(80))
console.log('Example 2: Error Handling for Unsupported Features\n')

const invalidSpec = {
  ...PSYCH_INTAKE_TEMPLATE,
  pages: [
    {
      id: 'upload',
      route: '/upload',
      role: 'PATIENT' as const,
      type: 'form' as const,
      title: 'Upload Documents',
      fields: [
        {
          id: 'document',
          type: 'file', // Unsupported field type
          label: 'Upload Document',
          required: true,
        },
      ],
    },
  ],
} as unknown as FastformAppSpec

try {
  compileAppSpecToPrompt(invalidSpec)
  console.error('✗ Should have thrown error')
} catch (error) {
  if (error instanceof UnsupportedAppSpecFeatureError) {
    console.log('✓ Caught unsupported feature:')
    console.log(`  Feature: ${error.feature}`)
    console.log(`  Message: ${error.message}`)
    if (error.suggestion) {
      console.log(`  Suggestion: ${error.suggestion}`)
    }
  } else {
    console.error('✗ Unexpected error:', error)
  }
}

console.log('\n' + '─'.repeat(80))
console.log('Example 3: Deterministic Output\n')

// Example 3: Verify deterministic output
const prompt1 = compileAppSpecToPrompt(PSYCH_INTAKE_TEMPLATE)
const prompt2 = compileAppSpecToPrompt(PSYCH_INTAKE_TEMPLATE)
const prompt3 = compileAppSpecToPrompt(PSYCH_INTAKE_TEMPLATE)

if (prompt1 === prompt2 && prompt2 === prompt3) {
  console.log('✓ Output is deterministic')
  console.log('  All three compilations produced identical output')
} else {
  console.error('✗ Output is NOT deterministic')
}

console.log('\n' + '─'.repeat(80))
console.log('\nUsage in production code:\n')
console.log(`
import { compileAppSpecToPrompt, UnsupportedAppSpecFeatureError } from '@/lib/compiler'
import type { FastformAppSpec } from '@/lib/types/appspec'

export async function generateAppCode(spec: FastformAppSpec) {
  try {
    // Compile AppSpec to prompt
    const prompt = compileAppSpecToPrompt(spec)

    // Send prompt to v0 for code generation
    const generatedCode = await v0.generate(prompt)

    return { success: true, code: generatedCode }
  } catch (error) {
    if (error instanceof UnsupportedAppSpecFeatureError) {
      return {
        success: false,
        error: error.message,
        suggestion: error.suggestion,
        feature: error.feature,
      }
    }
    throw error
  }
}
`.trim())

console.log('\n' + '═'.repeat(80))
