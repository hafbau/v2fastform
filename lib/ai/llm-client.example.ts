/**
 * Example usage of the LLM Client
 *
 * This file demonstrates how to use the LLM client to generate FastformAppSpec.
 * It is not meant to be run in production, but serves as documentation and
 * integration testing.
 *
 * To run this example:
 * 1. Set up environment variables (see .env.example)
 * 2. Run: tsx lib/ai/llm-client.example.ts
 *
 * @module ai/llm-client.example
 */

import {
  generateAppSpec,
  validateAppSpec,
  type Message,
} from './llm-client'

/**
 * Example 1: Simple patient intake form
 */
export async function example1SimpleIntake() {
  console.log('\n=== Example 1: Simple Patient Intake ===\n')

  const userIntent = `
Create a simple patient intake form for a dental clinic.

Requirements:
- Collect patient name, email, phone
- Ask about dental insurance
- Ask about reason for visit
- Get consent to share information
  `.trim()

  try {
    const spec = await generateAppSpec(userIntent, [])
    console.log('Generated AppSpec:')
    console.log(JSON.stringify(spec, null, 2))
    console.log('\nValidation:', validateAppSpec(spec) ? 'PASSED' : 'FAILED')
  } catch (error) {
    console.error('Error:', error)
  }
}

/**
 * Example 2: Conversational refinement
 */
export async function example2ConversationalRefinement() {
  console.log('\n=== Example 2: Conversational Refinement ===\n')

  // Simulate a conversation where requirements are refined
  const history: Message[] = [
    {
      role: 'user',
      content: 'I need a form for patient appointments',
    },
    {
      role: 'assistant',
      content:
        'I can help create that. What information do you need to collect from patients?',
    },
    {
      role: 'user',
      content:
        'Name, contact info, preferred appointment time, and reason for visit',
    },
    {
      role: 'assistant',
      content:
        'Great. Should this include any staff review or approval workflow?',
    },
  ]

  const finalIntent = `
Yes, add a staff workflow where:
- Staff can log in
- See list of appointment requests
- View details and either approve or request more information
  `.trim()

  try {
    const spec = await generateAppSpec(finalIntent, history)
    console.log('Generated AppSpec with conversation context:')
    console.log(JSON.stringify(spec, null, 2))
    console.log('\nValidation:', validateAppSpec(spec) ? 'PASSED' : 'FAILED')
  } catch (error) {
    console.error('Error:', error)
  }
}

/**
 * Example 3: Complex multi-page workflow
 */
export async function example3ComplexWorkflow() {
  console.log('\n=== Example 3: Complex Workflow ===\n')

  const userIntent = `
Create a patient referral system with the following workflow:

PATIENT SIDE:
1. Welcome page with consent
2. First page: Basic demographics (name, DOB, contact)
3. Second page: Current symptoms and medical history
4. Third page: Insurance information
5. Review page to confirm all information
6. Success page after submission

STAFF SIDE:
1. Login page for staff authentication
2. Inbox showing all referrals with status filters
3. Detail page for each referral with these actions:
   - Approve referral
   - Request more information
   - Reject referral

WORKFLOW:
- Patient submits → SUBMITTED status
- Staff can request info → NEEDS_INFO status (patient can resubmit)
- Staff can approve → APPROVED status (final)
- Staff can reject → REJECTED status (final)

Track analytics for page views and all status transitions.
  `.trim()

  try {
    const spec = await generateAppSpec(userIntent, [])
    console.log('Generated Complex AppSpec:')
    console.log(JSON.stringify(spec, null, 2))
    console.log('\nValidation:', validateAppSpec(spec) ? 'PASSED' : 'FAILED')

    // Print summary
    console.log('\n--- Generated Spec Summary ---')
    console.log('App Name:', spec.meta.name)
    console.log('Pages:', spec.pages.length)
    console.log('Workflow States:', spec.workflow.states.length)
    console.log('Transitions:', spec.workflow.transitions.length)
    console.log('Analytics Events:', spec.analytics.events.length)
  } catch (error) {
    console.error('Error:', error)
  }
}

/**
 * Run all examples
 */
async function main() {
  console.log('LLM Client Examples')
  console.log('===================')

  // Check for API keys
  const hasAzure =
    !!process.env.AZURE_OPENAI_ENDPOINT && !!process.env.AZURE_OPENAI_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY

  console.log('\nConfigured Providers:')
  console.log('- Azure OpenAI:', hasAzure ? 'YES' : 'NO')
  console.log('- OpenAI:', hasOpenAI ? 'YES' : 'NO')
  console.log('- Anthropic:', hasAnthropic ? 'YES' : 'NO')

  if (!hasAzure && !hasOpenAI && !hasAnthropic) {
    console.error('\n❌ No LLM providers configured!')
    console.error('Please set one of:')
    console.error('  - AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY')
    console.error('  - OPENAI_API_KEY')
    console.error('  - ANTHROPIC_API_KEY')
    process.exit(1)
  }

  // Run examples
  try {
    // Uncomment the examples you want to run
    // await example1SimpleIntake()
    // await example2ConversationalRefinement()
    // await example3ComplexWorkflow()

    console.log('\n✅ All examples completed successfully!')
  } catch (error) {
    console.error('\n❌ Example failed:', error)
    process.exit(1)
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
