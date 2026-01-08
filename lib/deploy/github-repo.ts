import { Octokit } from '@octokit/rest'

/**
 * Custom error class for GitHub repository operations
 */
export class GitHubRepoCreationError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message)
    this.name = 'GitHubRepoCreationError'
  }
}

/**
 * GitHub organization where repositories will be created.
 * Configurable via GITHUB_ORG environment variable.
 * Defaults to 'getfastform' if not set.
 */
const GITHUB_ORG = process.env.GITHUB_ORG || 'getfastform'

/**
 * Creates and configures an Octokit client instance
 * Validates that GITHUB_TOKEN environment variable is set
 *
 * @returns Configured Octokit client
 * @throws {GitHubRepoCreationError} If GITHUB_TOKEN is not set
 */
function getOctokitClient(): Octokit {
  const token = process.env.GITHUB_TOKEN

  if (!token) {
    throw new GitHubRepoCreationError(
      'GITHUB_TOKEN environment variable is not set. Please provide a Personal Access Token with repo:write scope.',
    )
  }

  return new Octokit({
    auth: token,
  })
}

/**
 * Generates a repository name from user ID and app slug
 * Format: {userId.slice(0,8)}-{appSlug}
 *
 * @param userId - User ID to be truncated
 * @param appSlug - Application slug
 * @returns Formatted repository name
 * @example
 * generateRepoName('a1b2c3d4e5f6', 'psych-intake') // 'a1b2c3d4-psych-intake'
 */
function generateRepoName(userId: string, appSlug: string): string {
  const userIdPrefix = userId.slice(0, 8)
  return `${userIdPrefix}-${appSlug}`
}

/**
 * Validates input parameters for repository creation
 *
 * @param userId - User ID to validate
 * @param appSlug - App slug to validate
 * @throws {GitHubRepoCreationError} If inputs are invalid
 */
function validateInputs(userId: string, appSlug: string): void {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new GitHubRepoCreationError(
      'userId must be a non-empty string',
    )
  }

  if (!appSlug || typeof appSlug !== 'string' || appSlug.trim() === '') {
    throw new GitHubRepoCreationError(
      'appSlug must be a non-empty string',
    )
  }

  // Validate slug format (alphanumeric and hyphens only)
  const slugRegex = /^[a-z0-9-]+$/
  if (!slugRegex.test(appSlug)) {
    throw new GitHubRepoCreationError(
      'appSlug must contain only lowercase letters, numbers, and hyphens',
    )
  }
}

/**
 * Waits for repository initialization to complete
 * GitHub needs time after auto_init to create the default branch
 *
 * @param octokit - Octokit client instance
 * @param owner - Repository owner (organization or user)
 * @param repoName - Repository name
 * @throws {GitHubRepoCreationError} If initialization times out
 */
async function waitForRepoInitialization(
  octokit: Octokit,
  owner: string,
  repoName: string,
): Promise<void> {
  const maxAttempts = 10
  const delayMs = 500

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await octokit.git.getRef({
        owner,
        repo: repoName,
        ref: 'heads/main',
      })
      // Success - main branch exists
      return
    } catch (error) {
      // Branch doesn't exist yet, wait and retry
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      } else {
        throw new GitHubRepoCreationError(
          'Repository initialization timed out waiting for default branch',
          error instanceof Error ? error : undefined,
        )
      }
    }
  }
}

/**
 * Creates staging branch from main branch
 *
 * @param octokit - Octokit client instance
 * @param owner - Repository owner
 * @param repoName - Repository name
 * @throws {GitHubRepoCreationError} If branch creation fails
 */
async function createStagingBranch(
  octokit: Octokit,
  owner: string,
  repoName: string,
): Promise<void> {
  try {
    // Get the SHA of the main branch
    const { data: mainRef } = await octokit.git.getRef({
      owner,
      repo: repoName,
      ref: 'heads/main',
    })

    const mainBranchSha = mainRef.object.sha

    // Create staging branch from main
    await octokit.git.createRef({
      owner,
      repo: repoName,
      ref: 'refs/heads/staging',
      sha: mainBranchSha,
    })
  } catch (error) {
    throw new GitHubRepoCreationError(
      'Failed to create staging branch',
      error instanceof Error ? error : undefined,
    )
  }
}

/**
 * Attempts to get existing repository information
 *
 * @param octokit - Octokit client instance
 * @param owner - Repository owner
 * @param repoName - Repository name
 * @returns Repository data if exists, null otherwise
 */
async function getExistingRepo(
  octokit: Octokit,
  owner: string,
  repoName: string,
): Promise<{ repoUrl: string; repoName: string } | null> {
  try {
    const { data: repo } = await octokit.repos.get({
      owner,
      repo: repoName,
    })

    return {
      repoUrl: repo.html_url,
      repoName: repo.name,
    }
  } catch {
    // Repository doesn't exist
    return null
  }
}

/**
 * Creates a new GitHub repository for a generated Fastform app
 * Initializes with README, Node.js .gitignore, and creates staging branch
 *
 * Repository naming convention: {userId.slice(0,8)}-{appSlug}
 * Example: 'a1b2c3d4-psych-intake'
 *
 * The repository is created under the 'getfastform' organization with:
 * - Private visibility
 * - Auto-initialized with README.md
 * - Node.js .gitignore template
 * - Two branches: main (default) and staging
 * - Description: "Generated by Fastform - {appSlug}"
 *
 * @param userId - User ID (minimum 8 characters recommended)
 * @param appSlug - Application slug (lowercase, alphanumeric with hyphens)
 * @returns Promise resolving to repository URL and name
 * @throws {GitHubRepoCreationError} If creation fails or inputs are invalid
 *
 * @example
 * const result = await createAppRepo('a1b2c3d4e5f6', 'psych-intake')
 * // Returns: {
 * //   repoUrl: 'https://github.com/getfastform/a1b2c3d4-psych-intake',
 * //   repoName: 'a1b2c3d4-psych-intake'
 * // }
 */
export async function createAppRepo(
  userId: string,
  appSlug: string,
): Promise<{ repoUrl: string; repoName: string }> {
  // Validate inputs
  validateInputs(userId, appSlug)

  // Get Octokit client
  const octokit = getOctokitClient()

  // Generate repository name
  const repoName = generateRepoName(userId, appSlug)

  try {
    // First, try to create in organization
    let owner = GITHUB_ORG
    let repoData

    try {
      const { data: repo } = await octokit.repos.createInOrg({
        org: GITHUB_ORG,
        name: repoName,
        description: `Generated by Fastform - ${appSlug}`,
        private: true,
        auto_init: true,
        gitignore_template: 'Node',
      })
      repoData = repo
    } catch (orgError: unknown) {
      // If organization creation fails, fall back to personal account
      if (orgError && typeof orgError === 'object' && 'status' in orgError) {
        const error = orgError as { status: number; message?: string }

        if (error.status === 404 || error.status === 403) {
          // Organization doesn't exist or no access, use personal account
          const { data: user } = await octokit.users.getAuthenticated()
          owner = user.login

          const { data: repo } = await octokit.repos.createForAuthenticatedUser({
            name: repoName,
            description: `Generated by Fastform - ${appSlug}`,
            private: true,
            auto_init: true,
            gitignore_template: 'Node',
          })
          repoData = repo
        } else if (error.status === 422) {
          // Repository already exists
          const existingRepo = await getExistingRepo(octokit, GITHUB_ORG, repoName)
          if (existingRepo) {
            return existingRepo
          }
          // Try personal account
          const { data: user } = await octokit.users.getAuthenticated()
          const personalRepo = await getExistingRepo(octokit, user.login, repoName)
          if (personalRepo) {
            return personalRepo
          }
          throw new GitHubRepoCreationError(
            `Repository ${repoName} already exists but could not be retrieved`,
            error instanceof Error ? error : undefined,
          )
        } else {
          throw orgError
        }
      } else {
        throw orgError
      }
    }

    // Wait for repository initialization
    await waitForRepoInitialization(octokit, owner, repoName)

    // Create staging branch
    await createStagingBranch(octokit, owner, repoName)

    return {
      repoUrl: repoData.html_url,
      repoName: repoData.name,
    }
  } catch (error: unknown) {
    // Handle specific GitHub API errors
    if (error instanceof GitHubRepoCreationError) {
      throw error
    }

    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status: number; message?: string }

      if (apiError.status === 403) {
        throw new GitHubRepoCreationError(
          'GitHub API rate limit exceeded or insufficient permissions. Please check your GITHUB_TOKEN scope (requires repo:write) or wait for rate limit reset.',
          error instanceof Error ? error : undefined,
        )
      }

      if (apiError.status === 422) {
        throw new GitHubRepoCreationError(
          `Repository ${repoName} already exists`,
          error instanceof Error ? error : undefined,
        )
      }
    }

    // Network or unknown errors
    throw new GitHubRepoCreationError(
      `Failed to create GitHub repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined,
    )
  }
}

/**
 * Checks if a repository exists
 *
 * @param repoName - Repository name to check
 * @returns Promise resolving to true if exists, false otherwise
 * @throws {GitHubRepoCreationError} If validation fails
 *
 * @example
 * const exists = await checkRepoExists('a1b2c3d4-psych-intake')
 * // Returns: true or false
 */
export async function checkRepoExists(repoName: string): Promise<boolean> {
  if (!repoName || typeof repoName !== 'string' || repoName.trim() === '') {
    throw new GitHubRepoCreationError('repoName must be a non-empty string')
  }

  const octokit = getOctokitClient()

  try {
    // Try organization first
    await octokit.repos.get({
      owner: GITHUB_ORG,
      repo: repoName,
    })
    return true
  } catch {
    // If not in organization, try personal account
    try {
      const { data: user } = await octokit.users.getAuthenticated()
      await octokit.repos.get({
        owner: user.login,
        repo: repoName,
      })
      return true
    } catch {
      // Repository doesn't exist in either location
      return false
    }
  }
}

/**
 * Deletes a repository
 * Use with caution - this operation cannot be undone
 *
 * @param repoName - Repository name to delete
 * @throws {GitHubRepoCreationError} If deletion fails
 *
 * @example
 * await deleteAppRepo('a1b2c3d4-psych-intake')
 */
export async function deleteAppRepo(repoName: string): Promise<void> {
  if (!repoName || typeof repoName !== 'string' || repoName.trim() === '') {
    throw new GitHubRepoCreationError('repoName must be a non-empty string')
  }

  const octokit = getOctokitClient()

  try {
    // Try organization first
    await octokit.repos.delete({
      owner: GITHUB_ORG,
      repo: repoName,
    })
    return
  } catch {
    // If not in organization, try personal account
    try {
      const { data: user } = await octokit.users.getAuthenticated()
      await octokit.repos.delete({
        owner: user.login,
        repo: repoName,
      })
      return
    } catch (error) {
      throw new GitHubRepoCreationError(
        `Failed to delete repository ${repoName}: Repository not found or insufficient permissions`,
        error instanceof Error ? error : undefined,
      )
    }
  }
}
