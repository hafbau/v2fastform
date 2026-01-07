/**
 * Generate an app name from the user's first message.
 * Takes the first 50 characters and cleans up the result.
 */
export function generateAppName(message: string): string {
  const trimmed = message.trim()

  // If message is too short, use default
  if (trimmed.length < 3) {
    return 'Untitled App'
  }

  // If message is 50 chars or less, use as-is
  if (trimmed.length <= 50) {
    return trimmed
  }

  // Take first 50 chars
  let name = trimmed.slice(0, 50)

  // Remove trailing incomplete word (find last space and truncate)
  const lastSpace = name.lastIndexOf(' ')
  if (lastSpace > 20) {
    // Only truncate at word boundary if we still have a reasonable length
    name = name.slice(0, lastSpace)
  }

  // Add ellipsis to indicate truncation
  return name + '...'
}
