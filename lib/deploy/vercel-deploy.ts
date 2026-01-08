/**
 * Vercel Deployment Orchestrator
 *
 * This module orchestrates the complete deployment pipeline from AppSpec to
 * live Vercel staging deployment. It coordinates multiple services:
 * - AppSpec compilation to prompts
 * - v0 code generation
 * - Post-processing for invariants
 * - GitHub repository management
 * - Vercel deployment monitoring
 *
 * Key Properties:
 * - PRODUCTION-READY: Comprehensive error handling and logging
 * - OBSERVABLE: Rich logging for debugging deployment issues
 * - RESILIENT: Automatic retries and timeout handling
 * - TYPE-SAFE: Full TypeScript types with no 'any'
 *
 * @module vercel-deploy
 */

import 'server-only'

import { Octokit } from '@octokit/rest'
import { createClient } from 'v0-sdk'
import type { ChatDetail } from 'v0-sdk'
import { compileAppSpecToPrompt } from '@/lib/compiler/appspec-to-prompt'
import { injectInvariants, extractFiles } from './post-processor'
import { createAppRepo } from './github-repo'
import { getAppById } from '@/lib/db/queries'
import type { FastformAppSpec } from '@/lib/types/appspec'

/**
 * Configuration constants for deployment process.
 * GITHUB_ORG is configurable via environment variable (defaults to 'getfastform').
 */
const GITHUB_ORG = process.env.GITHUB_ORG || 'getfastform'
const VERCEL_API_BASE_URL = 'https://api.vercel.com'
const DEPLOYMENT_POLL_INTERVAL_MS = 5000 // 5 seconds
const DEPLOYMENT_TIMEOUT_MS = 60000 // 60 seconds
const PRODUCTION_DEPLOYMENT_TIMEOUT_MS = 120000 // 120 seconds (production deploys may take longer)
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || undefined

/**
 * Custom error for deployment failures.
 */
export class DeploymentError extends Error {
  constructor(
    message: string,
    public readonly phase: DeploymentPhase,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'DeploymentError'

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DeploymentError)
    }
  }
}

/**
 * Custom error for code generation failures.
 */
export class CodeGenerationError extends Error {
  constructor(
    message: string,
    public readonly appId: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'CodeGenerationError'

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CodeGenerationError)
    }
  }
}

/**
 * Custom error for GitHub commit failures.
 */
export class GitHubCommitError extends Error {
  constructor(
    message: string,
    public readonly repoName: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'GitHubCommitError'

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitHubCommitError)
    }
  }
}

/**
 * Custom error for production promotion failures.
 */
export class ProductionPromotionError extends Error {
  constructor(
    message: string,
    public readonly appId: string,
    public readonly phase: 'verify_staging' | 'merge_branches' | 'poll_production',
    public readonly rollbackInfo?: {
      stagingDeploymentId: string
      stagingUrl: string
      lastKnownGoodSha?: string
    },
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ProductionPromotionError'

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProductionPromotionError)
    }
  }
}

/**
 * Deployment phases for tracking progress and error reporting.
 */
export type DeploymentPhase =
  | 'fetch_appspec'
  | 'compile_prompt'
  | 'generate_code'
  | 'post_process'
  | 'create_repo'
  | 'commit_code'
  | 'poll_deployment'

/**
 * Vercel deployment status from API.
 */
type VercelDeploymentStatus =
  | 'BUILDING'
  | 'ERROR'
  | 'INITIALIZING'
  | 'QUEUED'
  | 'READY'
  | 'CANCELED'

/**
 * Vercel deployment response from API.
 */
interface VercelDeployment {
  uid: string
  name: string
  url: string
  created: number
  state: VercelDeploymentStatus
  ready?: number
  creator: {
    uid: string
    email?: string
    username?: string
  }
  target?: string | null
  aliasAssigned?: number | null
  aliasError?: {
    code: string
    message: string
  } | null
  inspectorUrl?: string
  meta?: {
    githubCommitRef?: string
    githubCommitSha?: string
    githubCommitMessage?: string
    githubCommitOrg?: string
    githubCommitRepo?: string
    githubDeployment?: string
    githubOrg?: string
    githubRepo?: string
    githubRepoOwnerType?: string
  }
}

/**
 * Vercel deployments list response from API.
 */
interface VercelDeploymentsResponse {
  deployments: VercelDeployment[]
  pagination: {
    count: number
    next?: number
    prev?: number
  }
}

/**
 * Result of a successful staging deployment.
 */
export interface StagingDeploymentResult {
  stagingUrl: string
  deploymentId: string
  githubCommitSha: string
  repoUrl: string
  status: 'ready'
}

/**
 * Result of a successful production promotion.
 */
export interface ProductionPromotionResult {
  productionUrl: string
  deploymentId: string
  githubCommitSha: string
  mergedAt: string
  repoUrl: string
  status: 'ready'
}

/**
 * Get Octokit client instance with authentication.
 * Validates GITHUB_TOKEN environment variable.
 */
function getOctokitClient(): Octokit {
  const token = process.env.GITHUB_TOKEN

  if (!token) {
    throw new DeploymentError(
      'GITHUB_TOKEN environment variable is not set',
      'create_repo'
    )
  }

  return new Octokit({ auth: token })
}

/**
 * Get v0 SDK client instance with authentication.
 * Validates V0_API_KEY environment variable.
 */
function getV0Client() {
  const apiKey = process.env.V0_API_KEY

  if (!apiKey) {
    throw new DeploymentError(
      'V0_API_KEY environment variable is not set',
      'generate_code'
    )
  }

  return createClient(
    process.env.V0_API_URL ? { baseUrl: process.env.V0_API_URL } : {}
  )
}

/**
 * Get Vercel API token from environment.
 * Validates VERCEL_TOKEN environment variable.
 */
function getVercelToken(): string {
  const token = process.env.VERCEL_TOKEN

  if (!token) {
    throw new DeploymentError(
      'VERCEL_TOKEN environment variable is not set',
      'poll_deployment'
    )
  }

  return token
}

/**
 * Fetches and parses AppSpec from database.
 *
 * @param appId - The app ID to fetch
 * @returns Parsed FastformAppSpec
 * @throws {DeploymentError} When app not found or spec is invalid
 */
async function fetchAppSpec(appId: string): Promise<FastformAppSpec> {
  console.log(`[DEPLOY] Fetching AppSpec for app ${appId}`)

  const app = await getAppById({ appId })

  if (!app) {
    throw new DeploymentError(
      `App not found: ${appId}`,
      'fetch_appspec'
    )
  }

  // Parse and validate spec
  const spec = app.spec as unknown

  if (!spec || typeof spec !== 'object') {
    throw new DeploymentError(
      `Invalid AppSpec format for app ${appId}`,
      'fetch_appspec'
    )
  }

  // Type assertion - we trust the database schema validation
  const appSpec = spec as FastformAppSpec

  // Validate required fields
  if (!appSpec.id || !appSpec.meta || !appSpec.pages) {
    throw new DeploymentError(
      `AppSpec missing required fields for app ${appId}`,
      'fetch_appspec'
    )
  }

  console.log(`[DEPLOY] Successfully fetched AppSpec: ${appSpec.meta.name}`)
  return appSpec
}

/**
 * Generates code using v0 SDK based on compiled prompt.
 *
 * @param prompt - The compiled AppSpec prompt
 * @param appId - App ID for error reporting
 * @returns Chat detail with generated files
 * @throws {CodeGenerationError} When code generation fails
 */
async function generateCodeWithV0(
  prompt: string,
  appId: string
): Promise<ChatDetail> {
  console.log(`[DEPLOY] Starting v0 code generation for app ${appId}`)
  console.log(`[DEPLOY] Prompt length: ${prompt.length} characters`)

  const v0 = getV0Client()

  try {
    // Create new chat with the compiled prompt
    const chat = await v0.chats.create({
      message: prompt,
      responseMode: 'sync', // Wait for generation to complete
      chatPrivacy: 'private',
    })

    // Validate response
    if (!chat || typeof chat !== 'object' || !('id' in chat)) {
      throw new CodeGenerationError(
        'v0 API returned invalid response',
        appId
      )
    }

    // Type guard for streaming response
    if (chat instanceof ReadableStream) {
      throw new CodeGenerationError(
        'Unexpected streaming response from v0 (expected sync)',
        appId
      )
    }

    const chatDetail = chat as ChatDetail

    // Validate latest version exists with files
    if (!chatDetail.latestVersion) {
      throw new CodeGenerationError(
        'v0 generation completed but no version was created',
        appId
      )
    }

    if (chatDetail.latestVersion.status === 'failed') {
      throw new CodeGenerationError(
        'v0 code generation failed',
        appId
      )
    }

    if (!chatDetail.latestVersion.files || chatDetail.latestVersion.files.length === 0) {
      throw new CodeGenerationError(
        'v0 generation completed but no files were generated',
        appId
      )
    }

    console.log(`[DEPLOY] Code generation successful`)
    console.log(`[DEPLOY] Generated ${chatDetail.latestVersion.files.length} files`)
    console.log(`[DEPLOY] v0 Chat ID: ${chatDetail.id}`)

    return chatDetail
  } catch (error) {
    // Wrap all errors in CodeGenerationError
    if (error instanceof CodeGenerationError) {
      throw error
    }

    throw new CodeGenerationError(
      `v0 code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      appId,
      error
    )
  }
}

/**
 * Commits generated files to GitHub staging branch.
 *
 * @param repoName - Repository name
 * @param files - Array of file objects from v0
 * @param userId - User ID for commit author
 * @returns Commit SHA
 * @throws {GitHubCommitError} When commit fails
 */
async function commitFilesToGitHub(
  repoName: string,
  files: Array<{ name: string; content: string }>,
  _userId: string
): Promise<string> {
  console.log(`[DEPLOY] Committing ${files.length} files to GitHub`)
  console.log(`[DEPLOY] Repository: ${GITHUB_ORG}/${repoName}`)
  console.log(`[DEPLOY] Branch: staging`)

  const octokit = getOctokitClient()

  try {
    // Get current staging branch reference
    const { data: ref } = await octokit.git.getRef({
      owner: GITHUB_ORG,
      repo: repoName,
      ref: 'heads/staging',
    })

    const currentCommitSha = ref.object.sha

    // Get current commit to access tree
    const { data: currentCommit } = await octokit.git.getCommit({
      owner: GITHUB_ORG,
      repo: repoName,
      commit_sha: currentCommitSha,
    })

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await octokit.git.createBlob({
          owner: GITHUB_ORG,
          repo: repoName,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        })

        return {
          path: file.name,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        }
      })
    )

    // Create new tree
    const { data: newTree } = await octokit.git.createTree({
      owner: GITHUB_ORG,
      repo: repoName,
      tree: blobs,
      base_tree: currentCommit.tree.sha,
    })

    // Create commit
    const timestamp = new Date().toISOString()
    const commitMessage = `Deploy to staging - ${timestamp}`

    const { data: newCommit } = await octokit.git.createCommit({
      owner: GITHUB_ORG,
      repo: repoName,
      message: commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha],
    })

    // Update staging branch reference
    await octokit.git.updateRef({
      owner: GITHUB_ORG,
      repo: repoName,
      ref: 'heads/staging',
      sha: newCommit.sha,
    })

    console.log(`[DEPLOY] Successfully committed to GitHub`)
    console.log(`[DEPLOY] Commit SHA: ${newCommit.sha}`)

    return newCommit.sha
  } catch (error) {
    throw new GitHubCommitError(
      `Failed to commit files to GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
      repoName,
      error
    )
  }
}

/**
 * Polls Vercel API for deployment status.
 *
 * Vercel automatically deploys when commits are pushed to staging branch
 * via GitHub App integration. This function polls the API to find and
 * monitor the deployment status.
 *
 * @param repoName - Repository name
 * @param commitSha - Git commit SHA to match
 * @returns Deployment URL and ID once ready
 * @throws {DeploymentError} When deployment fails or times out
 */
async function pollVercelDeployment(
  repoName: string,
  commitSha: string
): Promise<{ url: string; deploymentId: string }> {
  console.log(`[DEPLOY] Polling Vercel for deployment status`)
  console.log(`[DEPLOY] Looking for deployment of commit ${commitSha}`)

  const token = getVercelToken()
  const startTime = Date.now()

  while (Date.now() - startTime < DEPLOYMENT_TIMEOUT_MS) {
    try {
      // Fetch recent deployments for the project
      const url = new URL(`${VERCEL_API_BASE_URL}/v6/deployments`)

      // Add team ID if configured
      if (VERCEL_TEAM_ID) {
        url.searchParams.set('teamId', VERCEL_TEAM_ID)
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.warn(
          `[DEPLOY] Vercel API returned ${response.status}: ${errorText}`
        )

        // Don't throw on API errors during polling - retry instead
        await new Promise((resolve) =>
          setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL_MS)
        )
        continue
      }

      const data = (await response.json()) as VercelDeploymentsResponse

      // Find deployment matching our commit and repo
      const deployment = data.deployments.find((d) => {
        const matchesRepo = d.name === repoName || d.meta?.githubRepo === repoName
        const matchesCommit = d.meta?.githubCommitSha === commitSha
        const matchesBranch = d.meta?.githubCommitRef === 'staging'

        return matchesRepo && matchesCommit && matchesBranch
      })

      if (deployment) {
        console.log(`[DEPLOY] Found deployment: ${deployment.uid}`)
        console.log(`[DEPLOY] Status: ${deployment.state}`)

        // Check deployment status
        if (deployment.state === 'READY') {
          const deploymentUrl = `https://${deployment.url}`
          console.log(`[DEPLOY] Deployment ready: ${deploymentUrl}`)

          return {
            url: deploymentUrl,
            deploymentId: deployment.uid,
          }
        }

        if (deployment.state === 'ERROR' || deployment.state === 'CANCELED') {
          throw new DeploymentError(
            `Vercel deployment failed with status: ${deployment.state}`,
            'poll_deployment'
          )
        }

        // Still building - continue polling
        console.log(
          `[DEPLOY] Deployment in progress (${deployment.state}), polling again in ${DEPLOYMENT_POLL_INTERVAL_MS / 1000}s`
        )
      } else {
        // No deployment found yet - Vercel might still be processing the webhook
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        console.log(
          `[DEPLOY] No deployment found yet (${elapsed}s elapsed), polling again in ${DEPLOYMENT_POLL_INTERVAL_MS / 1000}s`
        )
      }
    } catch (error) {
      // If this is a DeploymentError, rethrow it
      if (error instanceof DeploymentError) {
        throw error
      }

      // Log but don't throw on transient errors during polling
      console.warn(`[DEPLOY] Polling error:`, error)
    }

    // Wait before next poll
    await new Promise((resolve) =>
      setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL_MS)
    )
  }

  // Timeout reached
  throw new DeploymentError(
    `Deployment timed out after ${DEPLOYMENT_TIMEOUT_MS / 1000}s`,
    'poll_deployment'
  )
}

/**
 * Triggers a complete staging deployment for an app.
 *
 * This is the main entry point for the deployment pipeline. It orchestrates:
 * 1. Fetching AppSpec from database
 * 2. Compiling AppSpec to prompt
 * 3. Generating code with v0
 * 4. Post-processing with invariant injection
 * 5. Creating/updating GitHub repository
 * 6. Committing generated code
 * 7. Polling Vercel for deployment completion
 *
 * @param appId - The app ID to deploy
 * @returns Staging deployment details
 * @throws {DeploymentError} When deployment fails at any stage
 * @throws {CodeGenerationError} When v0 code generation fails
 * @throws {GitHubCommitError} When GitHub commit fails
 * @throws {Error} When post-processing fails
 *
 * @example
 * ```typescript
 * try {
 *   const result = await triggerStagingDeploy('app-uuid')
 *   console.log(`Deployed to: ${result.stagingUrl}`)
 * } catch (error) {
 *   if (error instanceof DeploymentError) {
 *     console.error(`Deployment failed at ${error.phase}: ${error.message}`)
 *   }
 * }
 * ```
 */
export async function triggerStagingDeploy(
  appId: string
): Promise<StagingDeploymentResult> {
  console.log(`[DEPLOY] ============================================`)
  console.log(`[DEPLOY] Starting staging deployment for app ${appId}`)
  console.log(`[DEPLOY] ============================================`)

  try {
    // ========================================================================
    // PHASE 1: Fetch AppSpec from database
    // ========================================================================
    const appSpec = await fetchAppSpec(appId)
    const { meta } = appSpec
    const userId = meta.orgId // Using orgId as userId for repo naming

    // ========================================================================
    // PHASE 2: Compile AppSpec to prompt
    // ========================================================================
    console.log(`[DEPLOY] Compiling AppSpec to prompt`)
    let prompt: string

    try {
      prompt = compileAppSpecToPrompt(appSpec)
      console.log(`[DEPLOY] Compilation successful`)
    } catch (error) {
      throw new DeploymentError(
        `Failed to compile AppSpec: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'compile_prompt',
        error
      )
    }

    // ========================================================================
    // PHASE 3: Generate code with v0
    // ========================================================================
    const chatDetail = await generateCodeWithV0(prompt, appId)

    // ========================================================================
    // PHASE 4: Post-process generated files
    // ========================================================================
    console.log(`[DEPLOY] Post-processing generated files`)

    let processedFiles: Array<{ name: string; content: string }>

    try {
      if (!chatDetail.latestVersion?.files) {
        throw new DeploymentError(
          'No files to post-process',
          'post_process'
        )
      }

      // Combine all v0 files into a single code string for post-processing
      // In the real implementation, we'd handle this more elegantly
      const v0GeneratedCode = chatDetail.latestVersion.files
        .map((f) => `// FILE: ${f.name}\n${f.content}`)
        .join('\n\n')

      // Inject invariants using the post-processor
      const injectionResult = await injectInvariants(v0GeneratedCode, appSpec)

      // Extract individual files from the injection result
      const extractedFiles = extractFiles(injectionResult)

      // Also include original v0 files (they might contain important app-specific code)
      processedFiles = [
        // Injected invariant files
        ...Object.entries(extractedFiles).map(([path, content]) => ({
          name: path,
          content,
        })),
        // Original v0 files
        ...chatDetail.latestVersion.files.map((f) => ({
          name: f.name,
          content: f.content,
        })),
      ]

      console.log(`[DEPLOY] Post-processing successful`)
      console.log(`[DEPLOY] Injected ${injectionResult.injectedFiles.length} invariant files`)
      console.log(`[DEPLOY] Total files to deploy: ${processedFiles.length}`)
    } catch (error) {
      throw new DeploymentError(
        `Post-processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'post_process',
        error
      )
    }

    // ========================================================================
    // PHASE 5: Create or verify GitHub repository
    // ========================================================================
    const userIdPrefix = userId.slice(0, 8)
    const repoName = `${userIdPrefix}-${meta.slug}`

    console.log(`[DEPLOY] Creating/verifying GitHub repository: ${repoName}`)

    try {
      // Try to create repo - will skip if already exists
      const octokit = getOctokitClient()

      try {
        await octokit.repos.get({
          owner: GITHUB_ORG,
          repo: repoName,
        })

        console.log(`[DEPLOY] Repository already exists, using existing repo`)
      } catch (error: unknown) {
        // Repository doesn't exist, create it
        const errorResponse = error as { status?: number }
        if (errorResponse.status === 404) {
          console.log(`[DEPLOY] Repository not found, creating new repo`)
          await createAppRepo(userId, meta.slug)
        } else {
          throw error
        }
      }
    } catch (error) {
      throw new DeploymentError(
        `Failed to create/verify GitHub repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'create_repo',
        error
      )
    }

    // ========================================================================
    // PHASE 6: Commit files to staging branch
    // ========================================================================
    const commitSha = await commitFilesToGitHub(repoName, processedFiles, userId)

    // ========================================================================
    // PHASE 7: Poll Vercel for deployment completion
    // ========================================================================
    const { url, deploymentId } = await pollVercelDeployment(repoName, commitSha)

    const repoUrl = `https://github.com/${GITHUB_ORG}/${repoName}`

    console.log(`[DEPLOY] ============================================`)
    console.log(`[DEPLOY] Deployment successful!`)
    console.log(`[DEPLOY] Staging URL: ${url}`)
    console.log(`[DEPLOY] Deployment ID: ${deploymentId}`)
    console.log(`[DEPLOY] GitHub Repo: ${repoUrl}`)
    console.log(`[DEPLOY] Commit SHA: ${commitSha}`)
    console.log(`[DEPLOY] ============================================`)

    return {
      stagingUrl: url,
      deploymentId,
      githubCommitSha: commitSha,
      repoUrl,
      status: 'ready',
    }
  } catch (error) {
    // Log error and rethrow
    console.error(`[DEPLOY] Deployment failed:`, error)

    // Rethrow known errors as-is
    if (
      error instanceof DeploymentError ||
      error instanceof CodeGenerationError ||
      error instanceof GitHubCommitError
    ) {
      throw error
    }

    // Wrap unknown errors
    throw new DeploymentError(
      `Unexpected deployment error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'fetch_appspec',
      error
    )
  }
}

/**
 * Verifies that a successful staging deployment exists.
 *
 * Queries Vercel API to find the most recent staging deployment for the app
 * and ensures it completed successfully.
 *
 * @param repoName - Repository name
 * @returns Staging deployment details
 * @throws {ProductionPromotionError} When no successful staging deployment found
 */
async function verifyStagingDeployment(
  repoName: string,
  appId: string
): Promise<{ deploymentId: string; url: string; commitSha: string }> {
  console.log(`[PROMOTE] Verifying staging deployment for ${repoName}`)

  const token = getVercelToken()

  try {
    const url = new URL(`${VERCEL_API_BASE_URL}/v6/deployments`)

    if (VERCEL_TEAM_ID) {
      url.searchParams.set('teamId', VERCEL_TEAM_ID)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new ProductionPromotionError(
        `Failed to query Vercel API: ${response.status} - ${errorText}`,
        appId,
        'verify_staging'
      )
    }

    const data = (await response.json()) as VercelDeploymentsResponse

    // Find the most recent successful staging deployment
    const stagingDeployment = data.deployments.find((d) => {
      const matchesRepo = d.name === repoName || d.meta?.githubRepo === repoName
      const matchesBranch = d.meta?.githubCommitRef === 'staging'
      const isReady = d.state === 'READY'

      return matchesRepo && matchesBranch && isReady
    })

    if (!stagingDeployment) {
      throw new ProductionPromotionError(
        'No successful staging deployment found. Please deploy to staging first.',
        appId,
        'verify_staging'
      )
    }

    if (!stagingDeployment.meta?.githubCommitSha) {
      throw new ProductionPromotionError(
        'Staging deployment missing GitHub commit SHA',
        appId,
        'verify_staging'
      )
    }

    console.log(`[PROMOTE] Found staging deployment: ${stagingDeployment.uid}`)
    console.log(`[PROMOTE] Staging URL: https://${stagingDeployment.url}`)
    console.log(`[PROMOTE] Commit SHA: ${stagingDeployment.meta.githubCommitSha}`)

    return {
      deploymentId: stagingDeployment.uid,
      url: `https://${stagingDeployment.url}`,
      commitSha: stagingDeployment.meta.githubCommitSha,
    }
  } catch (error) {
    if (error instanceof ProductionPromotionError) {
      throw error
    }

    throw new ProductionPromotionError(
      `Failed to verify staging deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      appId,
      'verify_staging',
      undefined,
      error
    )
  }
}

/**
 * Checks if there's already a production deployment in progress.
 *
 * @param repoName - Repository name
 * @returns True if production deployment is in progress
 */
async function hasProductionDeploymentInProgress(
  repoName: string
): Promise<boolean> {
  console.log(`[PROMOTE] Checking for in-progress production deployments`)

  const token = getVercelToken()

  try {
    const url = new URL(`${VERCEL_API_BASE_URL}/v6/deployments`)

    if (VERCEL_TEAM_ID) {
      url.searchParams.set('teamId', VERCEL_TEAM_ID)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      // Non-critical error - proceed with caution
      console.warn(`[PROMOTE] Failed to check production deployments: ${response.status}`)
      return false
    }

    const data = (await response.json()) as VercelDeploymentsResponse

    // Check for in-progress production deployments
    const inProgressDeployment = data.deployments.find((d) => {
      const matchesRepo = d.name === repoName || d.meta?.githubRepo === repoName
      const matchesBranch = d.meta?.githubCommitRef === 'main'
      const isInProgress =
        d.state === 'BUILDING' || d.state === 'INITIALIZING' || d.state === 'QUEUED'

      return matchesRepo && matchesBranch && isInProgress
    })

    if (inProgressDeployment) {
      console.log(`[PROMOTE] Found in-progress production deployment: ${inProgressDeployment.uid}`)
      return true
    }

    console.log(`[PROMOTE] No in-progress production deployments found`)
    return false
  } catch (error) {
    // Non-critical error - log and proceed
    console.warn(`[PROMOTE] Error checking production deployments:`, error)
    return false
  }
}

/**
 * Merges staging branch to main branch via GitHub API.
 *
 * Creates a pull request from staging to main and auto-merges it.
 * This triggers Vercel's automatic production deployment.
 *
 * @param repoName - Repository name
 * @param appId - App ID for error reporting
 * @returns Merge commit SHA and timestamp
 * @throws {ProductionPromotionError} When merge fails
 */
async function mergeStagingToMain(
  repoName: string,
  appId: string
): Promise<{ commitSha: string; mergedAt: string }> {
  console.log(`[PROMOTE] Merging staging to main for ${repoName}`)

  const octokit = getOctokitClient()

  try {
    // Check if there are any differences between staging and main
    const { data: comparison } = await octokit.repos.compareCommits({
      owner: GITHUB_ORG,
      repo: repoName,
      base: 'main',
      head: 'staging',
    })

    if (comparison.status === 'identical') {
      console.log(`[PROMOTE] Staging and main are identical, no merge needed`)

      // Get current main branch SHA
      const { data: mainRef } = await octokit.git.getRef({
        owner: GITHUB_ORG,
        repo: repoName,
        ref: 'heads/main',
      })

      return {
        commitSha: mainRef.object.sha,
        mergedAt: new Date().toISOString(),
      }
    }

    console.log(`[PROMOTE] Found ${comparison.ahead_by} commits ahead in staging`)

    // Create pull request from staging to main
    const timestamp = new Date().toISOString()
    const prTitle = `Promote to production - ${timestamp}`
    const prBody = `Automated promotion from staging to production\n\nThis PR was automatically created by the production promotion service.`

    let pullNumber: number

    try {
      const { data: pr } = await octokit.pulls.create({
        owner: GITHUB_ORG,
        repo: repoName,
        title: prTitle,
        body: prBody,
        head: 'staging',
        base: 'main',
      })

      pullNumber = pr.number
      console.log(`[PROMOTE] Created pull request #${pullNumber}`)
    } catch (error: unknown) {
      // Check if it's a "no commits between" error (branches are identical)
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('No commits between')) {
        console.log(`[PROMOTE] Branches are identical, no merge needed`)

        // Get current main branch SHA
        const { data: mainRef } = await octokit.git.getRef({
          owner: GITHUB_ORG,
          repo: repoName,
          ref: 'heads/main',
        })

        return {
          commitSha: mainRef.object.sha,
          mergedAt: new Date().toISOString(),
        }
      }

      // Check for merge conflicts or other errors
      throw new ProductionPromotionError(
        `Failed to create pull request: ${errorMessage}`,
        appId,
        'merge_branches',
        undefined,
        error
      )
    }

    // Merge the pull request
    try {
      const { data: merge } = await octokit.pulls.merge({
        owner: GITHUB_ORG,
        repo: repoName,
        pull_number: pullNumber,
        merge_method: 'merge',
        commit_title: prTitle,
        commit_message: prBody,
      })

      console.log(`[PROMOTE] Successfully merged PR #${pullNumber}`)
      console.log(`[PROMOTE] Merge commit SHA: ${merge.sha}`)

      return {
        commitSha: merge.sha,
        mergedAt: new Date().toISOString(),
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Check if it's a merge conflict
      if (errorMessage.includes('merge conflict')) {
        throw new ProductionPromotionError(
          'Merge conflict detected between staging and main branches. Please resolve conflicts manually.',
          appId,
          'merge_branches',
          undefined,
          error
        )
      }

      throw new ProductionPromotionError(
        `Failed to merge pull request: ${errorMessage}`,
        appId,
        'merge_branches',
        undefined,
        error
      )
    }
  } catch (error) {
    if (error instanceof ProductionPromotionError) {
      throw error
    }

    throw new ProductionPromotionError(
      `Failed to merge staging to main: ${error instanceof Error ? error.message : 'Unknown error'}`,
      appId,
      'merge_branches',
      undefined,
      error
    )
  }
}

/**
 * Polls Vercel API for production deployment status.
 *
 * Waits for Vercel to detect the main branch update and complete the
 * production deployment.
 *
 * @param repoName - Repository name
 * @param commitSha - Git commit SHA to match
 * @param appId - App ID for error reporting
 * @param userId - User ID for URL generation
 * @returns Production deployment URL and ID once ready
 * @throws {ProductionPromotionError} When deployment fails or times out
 */
async function pollProductionDeployment(
  repoName: string,
  commitSha: string,
  appId: string,
  _userId: string
): Promise<{ url: string; deploymentId: string }> {
  console.log(`[PROMOTE] Polling Vercel for production deployment status`)
  console.log(`[PROMOTE] Looking for deployment of commit ${commitSha}`)

  const token = getVercelToken()
  const startTime = Date.now()

  while (Date.now() - startTime < PRODUCTION_DEPLOYMENT_TIMEOUT_MS) {
    try {
      const url = new URL(`${VERCEL_API_BASE_URL}/v6/deployments`)

      if (VERCEL_TEAM_ID) {
        url.searchParams.set('teamId', VERCEL_TEAM_ID)
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.warn(
          `[PROMOTE] Vercel API returned ${response.status}: ${errorText}`
        )

        // Don't throw on API errors during polling - retry instead
        await new Promise((resolve) =>
          setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL_MS)
        )
        continue
      }

      const data = (await response.json()) as VercelDeploymentsResponse

      // Find deployment matching our commit and main branch
      const deployment = data.deployments.find((d) => {
        const matchesRepo = d.name === repoName || d.meta?.githubRepo === repoName
        const matchesCommit = d.meta?.githubCommitSha === commitSha
        const matchesBranch = d.meta?.githubCommitRef === 'main'

        return matchesRepo && matchesCommit && matchesBranch
      })

      if (deployment) {
        console.log(`[PROMOTE] Found deployment: ${deployment.uid}`)
        console.log(`[PROMOTE] Status: ${deployment.state}`)

        // Check deployment status
        if (deployment.state === 'READY') {
          const productionUrl = `https://${deployment.url}`
          console.log(`[PROMOTE] Production deployment ready: ${productionUrl}`)

          return {
            url: productionUrl,
            deploymentId: deployment.uid,
          }
        }

        if (deployment.state === 'ERROR' || deployment.state === 'CANCELED') {
          throw new ProductionPromotionError(
            `Production deployment failed with status: ${deployment.state}`,
            appId,
            'poll_production'
          )
        }

        // Still building - continue polling
        console.log(
          `[PROMOTE] Deployment in progress (${deployment.state}), polling again in ${DEPLOYMENT_POLL_INTERVAL_MS / 1000}s`
        )
      } else {
        // No deployment found yet - Vercel might still be processing the webhook
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        console.log(
          `[PROMOTE] No deployment found yet (${elapsed}s elapsed), polling again in ${DEPLOYMENT_POLL_INTERVAL_MS / 1000}s`
        )
      }
    } catch (error) {
      // If this is a ProductionPromotionError, rethrow it
      if (error instanceof ProductionPromotionError) {
        throw error
      }

      // Log but don't throw on transient errors during polling
      console.warn(`[PROMOTE] Polling error:`, error)
    }

    // Wait before next poll
    await new Promise((resolve) =>
      setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL_MS)
    )
  }

  // Timeout reached
  throw new ProductionPromotionError(
    `Production deployment timed out after ${PRODUCTION_DEPLOYMENT_TIMEOUT_MS / 1000}s`,
    appId,
    'poll_production'
  )
}

/**
 * Promotes a staging deployment to production.
 *
 * This function safely promotes a tested staging deployment to production by:
 * 1. Verifying that a successful staging deployment exists
 * 2. Checking that no production deployment is currently in progress
 * 3. Merging the staging branch to main via a GitHub pull request
 * 4. Waiting for Vercel to automatically deploy the main branch
 * 5. Returning the production URL once the deployment is ready
 *
 * The production URL follows the format: https://{appSlug}-{userId-prefix}.vercel.app
 *
 * @param appId - The app ID to promote to production
 * @returns Production deployment details including URL and deployment ID
 * @throws {ProductionPromotionError} When promotion fails at any stage
 * @throws {DeploymentError} When app or configuration is invalid
 *
 * @example
 * ```typescript
 * try {
 *   const result = await promoteToProduction('app-uuid')
 *   console.log(`Promoted to: ${result.productionUrl}`)
 * } catch (error) {
 *   if (error instanceof ProductionPromotionError) {
 *     console.error(`Promotion failed at ${error.phase}: ${error.message}`)
 *     if (error.rollbackInfo) {
 *       console.log(`Rollback to: ${error.rollbackInfo.stagingUrl}`)
 *     }
 *   }
 * }
 * ```
 */
export async function promoteToProduction(
  appId: string
): Promise<ProductionPromotionResult> {
  console.log(`[PROMOTE] ============================================`)
  console.log(`[PROMOTE] Starting production promotion for app ${appId}`)
  console.log(`[PROMOTE] ============================================`)

  try {
    // ========================================================================
    // PHASE 1: Fetch AppSpec and generate repository name
    // ========================================================================
    const appSpec = await fetchAppSpec(appId)
    const { meta } = appSpec
    const userId = meta.orgId
    const userIdPrefix = userId.slice(0, 8)
    const repoName = `${userIdPrefix}-${meta.slug}`
    const repoUrl = `https://github.com/${GITHUB_ORG}/${repoName}`

    console.log(`[PROMOTE] App: ${meta.name}`)
    console.log(`[PROMOTE] Repository: ${repoName}`)

    // ========================================================================
    // PHASE 2: Verify staging deployment exists and succeeded
    // ========================================================================
    const stagingDeployment = await verifyStagingDeployment(repoName, appId)

    console.log(`[PROMOTE] Staging deployment verified`)
    console.log(`[PROMOTE] Staging URL: ${stagingDeployment.url}`)
    console.log(`[PROMOTE] Staging commit: ${stagingDeployment.commitSha}`)

    // ========================================================================
    // PHASE 3: Check for in-progress production deployments
    // ========================================================================
    const hasInProgressDeployment = await hasProductionDeploymentInProgress(repoName)

    if (hasInProgressDeployment) {
      throw new ProductionPromotionError(
        'Production deployment already in progress. Please wait for it to complete before promoting again.',
        appId,
        'verify_staging',
        {
          stagingDeploymentId: stagingDeployment.deploymentId,
          stagingUrl: stagingDeployment.url,
        }
      )
    }

    // ========================================================================
    // PHASE 4: Merge staging to main branch
    // ========================================================================
    const mergeResult = await mergeStagingToMain(repoName, appId)

    console.log(`[PROMOTE] Successfully merged staging to main`)
    console.log(`[PROMOTE] Merge commit: ${mergeResult.commitSha}`)
    console.log(`[PROMOTE] Merged at: ${mergeResult.mergedAt}`)

    // ========================================================================
    // PHASE 5: Poll Vercel for production deployment
    // ========================================================================
    const productionDeployment = await pollProductionDeployment(
      repoName,
      mergeResult.commitSha,
      appId,
      userId
    )

    console.log(`[PROMOTE] ============================================`)
    console.log(`[PROMOTE] Production promotion successful!`)
    console.log(`[PROMOTE] Production URL: ${productionDeployment.url}`)
    console.log(`[PROMOTE] Deployment ID: ${productionDeployment.deploymentId}`)
    console.log(`[PROMOTE] GitHub Repo: ${repoUrl}`)
    console.log(`[PROMOTE] Commit SHA: ${mergeResult.commitSha}`)
    console.log(`[PROMOTE] ============================================`)

    return {
      productionUrl: productionDeployment.url,
      deploymentId: productionDeployment.deploymentId,
      githubCommitSha: mergeResult.commitSha,
      mergedAt: mergeResult.mergedAt,
      repoUrl,
      status: 'ready',
    }
  } catch (error) {
    // Log error and rethrow
    console.error(`[PROMOTE] Production promotion failed:`, error)

    // Rethrow known errors as-is
    if (
      error instanceof ProductionPromotionError ||
      error instanceof DeploymentError
    ) {
      throw error
    }

    // Wrap unknown errors
    throw new ProductionPromotionError(
      `Unexpected promotion error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      appId,
      'verify_staging',
      undefined,
      error
    )
  }
}
