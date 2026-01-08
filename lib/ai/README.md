# LLM Client for FastformAppSpec Generation

This module provides a unified interface for generating FastformAppSpec using LLMs with automatic provider fallback.

## Features

- **Multi-Provider Support**: Azure OpenAI, OpenAI, and Anthropic
- **Automatic Fallback**: Cascading fallback strategy ensures resilience
- **Structured Output**: Guaranteed valid AppSpec JSON with schema validation
- **Conversation Context**: Support for multi-turn conversations
- **Type-Safe**: Full TypeScript support with comprehensive error types
- **Production-Ready**: Comprehensive error handling and logging

## Quick Start

```typescript
import { generateAppSpec } from '@/lib/ai/llm-client'

const spec = await generateAppSpec(
  'Create a patient intake form for a dental clinic',
  []
)

console.log(spec.meta.name)
```

## Environment Setup

Configure at least one LLM provider:

### Azure OpenAI (Preferred)

```bash
AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
AZURE_OPENAI_KEY="your-azure-key"
```

### OpenAI (Fallback)

```bash
OPENAI_API_KEY="sk-..."
```

### Anthropic (Final Fallback)

```bash
ANTHROPIC_API_KEY="sk-ant-..."
```

## Provider Priority

The client tries providers in this order:

1. **Azure OpenAI** - If `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` are set
2. **OpenAI** - If `OPENAI_API_KEY` is set
3. **Anthropic** - If `ANTHROPIC_API_KEY` is set

If one provider fails, it automatically falls back to the next configured provider.

## API Reference

### `generateAppSpec(userIntent, conversationHistory?)`

Generates a FastformAppSpec from user intent.

**Parameters:**

- `userIntent` (string): User's description of the desired application
- `conversationHistory` (Message[], optional): Previous conversation for context

**Returns:** `Promise<FastformAppSpec>`

**Throws:**

- `NoProvidersConfiguredError` - No LLM providers configured
- `AppSpecGenerationError` - Generation or validation failed

**Example:**

```typescript
const spec = await generateAppSpec(
  'Create a patient referral form with staff approval workflow',
  []
)
```

### `validateAppSpec(spec)`

Validates an object against the FastformAppSpec v0.3 schema.

**Parameters:**

- `spec` (unknown): Object to validate

**Returns:** `boolean`

**Example:**

```typescript
if (validateAppSpec(data)) {
  // data is now typed as FastformAppSpec
  console.log(data.meta.name)
}
```

## Message Interface

```typescript
interface Message {
  role: 'user' | 'assistant'
  content: string
}
```

Used for conversation history to provide context across multiple turns.

## Error Types

### `NoProvidersConfiguredError`

Thrown when no LLM providers are configured.

```typescript
try {
  await generateAppSpec('...')
} catch (error) {
  if (error instanceof NoProvidersConfiguredError) {
    console.error('Please configure an LLM provider')
  }
}
```

### `AppSpecGenerationError`

Thrown when generation or validation fails.

**Properties:**

- `message` (string): Error description
- `provider` (string): Provider that failed
- `cause` (unknown): Original error if available

```typescript
try {
  await generateAppSpec('...')
} catch (error) {
  if (error instanceof AppSpecGenerationError) {
    console.error(`Failed with ${error.provider}: ${error.message}`)
  }
}
```

## Usage Examples

### Example 1: Simple Patient Intake

```typescript
import { generateAppSpec } from '@/lib/ai/llm-client'

const spec = await generateAppSpec(
  `Create a patient intake form collecting:
   - Name, email, phone
   - Reason for visit
   - Dental insurance info
   - Consent checkbox`,
  []
)
```

### Example 2: Conversational Refinement

```typescript
import { generateAppSpec, type Message } from '@/lib/ai/llm-client'

const history: Message[] = [
  { role: 'user', content: 'I need a form for appointments' },
  { role: 'assistant', content: 'What info should we collect?' },
  { role: 'user', content: 'Name, contact, preferred time' },
]

const spec = await generateAppSpec(
  'Add staff approval workflow',
  history
)
```

### Example 3: Complex Multi-Page Workflow

```typescript
const spec = await generateAppSpec(
  `Create a patient referral system:

   PATIENT PAGES:
   1. Welcome with consent
   2. Demographics form
   3. Medical history
   4. Insurance
   5. Review and submit

   STAFF PAGES:
   1. Login
   2. Referral inbox
   3. Detail view with approve/reject actions

   WORKFLOW:
   - Patient submits → SUBMITTED
   - Staff can request info → NEEDS_INFO
   - Staff can approve/reject → APPROVED/REJECTED`,
  []
)
```

## System Prompt Details

The system prompt includes:

- Complete FastformAppSpec v0.3 schema with all interfaces
- Generation guidelines for typical page flows
- Workflow state machine patterns
- Placeholder conventions (e.g., `{{APP_ID_UUID}}`)
- API endpoint patterns
- Analytics event patterns

This ensures generated specs follow best practices and are immediately usable.

## Testing

Run the test suite:

```bash
npm test -- lib/ai/llm-client.test.ts
```

Run example scenarios:

```bash
tsx lib/ai/llm-client.example.ts
```

## Implementation Notes

### JSON Parsing

The client handles various response formats:

- Clean JSON
- JSON wrapped in markdown code blocks (````json`)
- JSON with surrounding text

### Validation

Generated specs are validated using `isValidAppSpec()` type guard before returning. This ensures:

- Required fields are present
- Types match the schema
- Enum values are valid
- Nested objects are well-formed

### Logging

The client logs provider attempts and results to console for debugging:

```
Attempting to generate AppSpec with Azure OpenAI...
Successfully generated AppSpec with Azure OpenAI
```

Failed attempts are logged as warnings:

```
Failed to generate with Azure OpenAI: Connection timeout
```

## Architecture

```
┌─────────────────┐
│  generateAppSpec│
└────────┬────────┘
         │
         ├─> Get Configured Providers
         │   ├─> Azure OpenAI?
         │   ├─> OpenAI?
         │   └─> Anthropic?
         │
         ├─> Build System Prompt
         │   └─> Include complete schema
         │
         ├─> Build User Prompt
         │   ├─> Include conversation history
         │   └─> Add current intent
         │
         ├─> Try Each Provider
         │   ├─> Generate text
         │   ├─> Parse JSON
         │   └─> Validate schema
         │
         └─> Return Valid AppSpec
```

## Future Enhancements

Potential improvements for future iterations:

1. **Streaming Support**: Stream spec generation for better UX
2. **Caching**: Cache successful prompts/specs
3. **Retry Logic**: Exponential backoff for transient failures
4. **Token Usage Tracking**: Monitor and optimize token consumption
5. **Custom Model Selection**: Allow model override per request
6. **Validation Feedback**: Return detailed validation errors to LLM for auto-correction
7. **Template Library**: Pre-built templates for common use cases

## Related Files

- `/lib/types/appspec.ts` - FastformAppSpec type definitions and validation
- `/lib/ai/llm-client.test.ts` - Comprehensive test suite
- `/lib/ai/llm-client.example.ts` - Usage examples and integration tests
