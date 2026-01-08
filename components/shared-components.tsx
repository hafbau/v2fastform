import React from 'react'
import {
  CodeBlock,
  MathPart,
  ThinkingSectionProps,
  TaskSectionProps,
  CodeProjectPartProps,
} from '@v0-sdk/react'
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/components/ai-elements/reasoning'
import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskItem,
  TaskItemFile,
} from '@/components/ai-elements/task'

// Wrapper component to adapt AI Elements Reasoning to @v0-sdk/react ThinkingSection
export const ThinkingSectionWrapper = ({
  title,
  duration,
  thought,
  collapsed,
  onCollapse,
  children,
  brainIcon: _brainIcon,
  chevronRightIcon: _chevronRightIcon,
  chevronDownIcon: _chevronDownIcon,
  iconRenderer: _iconRenderer,
  ...props
}: ThinkingSectionProps) => {
  return (
    <Reasoning
      duration={duration ? Math.round(duration) : duration}
      defaultOpen={!collapsed}
      onOpenChange={() => onCollapse?.()}
      {...props}
    >
      <ReasoningTrigger title={title || 'Thinking'} />
      <ReasoningContent>
        {thought ||
          (typeof children === 'string'
            ? children
            : 'No thinking content available')}
      </ReasoningContent>
    </Reasoning>
  )
}

// Wrapper component to adapt AI Elements Task to @v0-sdk/react TaskSection
export const TaskSectionWrapper = ({
  title,
  type,
  parts,
  collapsed,
  onCollapse,
  className,
  children,
  taskIcon: _taskIcon,
  chevronRightIcon: _chevronRightIcon,
  chevronDownIcon: _chevronDownIcon,
  iconRenderer: _iconRenderer,
}: TaskSectionProps) => {
  return (
    <Task
      className={`w-full mb-4 ${className || ''}`}
      defaultOpen={!collapsed}
      onOpenChange={() => onCollapse?.()}
    >
      <TaskTrigger title={title || type || 'Task'} />
      <TaskContent>
        {parts &&
          parts.length > 0 &&
          parts.map((part, index) => {
            if (typeof part === 'string') {
              return <TaskItem key={index}>{part}</TaskItem>
            }

            // Handle structured task data with proper AI Elements components
            if (part && typeof part === 'object') {
              const partObj = part

              if (partObj.type === 'starting-repo-search' && partObj.query) {
                return (
                  <TaskItem key={index}>Searching: "{partObj.query}"</TaskItem>
                )
              }

              if (
                partObj.type === 'select-files' &&
                Array.isArray(partObj.filePaths)
              ) {
                return (
                  <TaskItem key={index}>
                    Read{' '}
                    {partObj.filePaths.map((file: string, i: number) => (
                      <TaskItemFile key={i}>
                        {file.split('/').pop()}
                      </TaskItemFile>
                    ))}
                  </TaskItem>
                )
              }

              if (partObj.type === 'fetching-diagnostics') {
                return <TaskItem key={index}>Checking for issues...</TaskItem>
              }

              if (partObj.type === 'diagnostics-passed') {
                return <TaskItem key={index}>✓ No issues found</TaskItem>
              }

              // Handle task-read-file-v1 part types
              if (partObj.type === 'reading-file' && partObj.filePath) {
                return (
                  <TaskItem key={index}>
                    Reading file <TaskItemFile>{partObj.filePath}</TaskItemFile>
                  </TaskItem>
                )
              }

              // Handle task-coding-v1 part types
              if (partObj.type === 'code-project' && partObj.changedFiles) {
                return (
                  <TaskItem key={index}>
                    Editing{' '}
                    {partObj.changedFiles.map((file, i: number) => (
                      <TaskItemFile key={i}>
                        {file.fileName || file.baseName}
                      </TaskItemFile>
                    ))}
                  </TaskItem>
                )
              }

              if (partObj.type === 'launch-tasks') {
                return <TaskItem key={index}>Starting tasks...</TaskItem>
              }

              // Handle task-search-web-v1 part types
              if (partObj.type === 'starting-web-search' && partObj.query) {
                return (
                  <TaskItem key={index}>Searching: "{partObj.query}"</TaskItem>
                )
              }

              if (partObj.type === 'got-results' && partObj.count) {
                return (
                  <TaskItem key={index}>Found {partObj.count} results</TaskItem>
                )
              }

              if (partObj.type === 'finished-web-search' && partObj.answer) {
                return (
                  <TaskItem key={index}>
                    <div className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                      {partObj.answer}
                    </div>
                  </TaskItem>
                )
              }

              // Handle integration request parts (user-input-required)
              if (partObj.type === 'request-install-integration') {
                const steps = partObj.steps || []
                return (
                  <TaskItem key={index}>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Action Required</span>
                      </div>
                      {steps.map((step, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          <span>Add integration: <strong>{step.stepName || step.type}</strong></span>
                        </div>
                      ))}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Please add this integration on fastform to continue
                      </p>
                    </div>
                  </TaskItem>
                )
              }

              // Handle design inspiration task parts
              if (partObj.type === 'generating-design-inspiration') {
                return (
                  <TaskItem key={index}>
                    Generating design inspiration...
                  </TaskItem>
                )
              }

              // Handle starting-design-inspiration
              if (partObj.type === 'starting-design-inspiration') {
                return (
                  <TaskItem key={index}>
                    <div className="text-gray-600 dark:text-gray-400 text-sm">
                      Generating design inspiration for: "{partObj.prompt?.substring(0, 100)}{partObj.prompt?.length > 100 ? '...' : ''}"
                    </div>
                  </TaskItem>
                )
              }

              // Handle finished-design-inspiration
              if (partObj.type === 'finished-design-inspiration') {
                return (
                  <TaskItem key={index}>
                    <div className="text-green-600 dark:text-green-400 text-sm">
                      ✓ Design inspiration generated
                    </div>
                  </TaskItem>
                )
              }

              // Handle tool-calls (waiting state)
              if (partObj.type === 'tool-calls') {
                return null // Don't render anything for tool-calls waiting state
              }

              if (
                partObj.type === 'design-inspiration-complete' &&
                Array.isArray(partObj.inspirations)
              ) {
                return (
                  <TaskItem key={index}>
                    <div className="space-y-2">
                      <div className="text-gray-700 dark:text-gray-300 text-sm">
                        Generated {partObj.inspirations.length} design
                        inspirations
                      </div>
                      {partObj.inspirations
                        .slice(0, 3)
                        .map((inspiration, i: number) => (
                          <div
                            key={i}
                            className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded"
                          >
                            {inspiration.title ||
                              inspiration.description ||
                              `Inspiration ${i + 1}`}
                          </div>
                        ))}
                    </div>
                  </TaskItem>
                )
              }

              // Handle other potential task types
              if (partObj.type === 'analyzing-requirements') {
                return (
                  <TaskItem key={index}>Analyzing requirements...</TaskItem>
                )
              }

              if (
                partObj.type === 'requirements-complete' &&
                partObj.requirements
              ) {
                return (
                  <TaskItem key={index}>
                    <div className="text-gray-700 dark:text-gray-300 text-sm">
                      Analyzed {partObj.requirements.length || 'several'}{' '}
                      requirements
                    </div>
                  </TaskItem>
                )
              }

              // Handle additional common task part types
              if (partObj.type === 'thinking' || partObj.type === 'analyzing') {
                return (
                  <TaskItem key={index}>
                    <div className="text-gray-600 dark:text-gray-400 text-sm italic">
                      Thinking...
                    </div>
                  </TaskItem>
                )
              }

              if (partObj.type === 'processing' || partObj.type === 'working') {
                return (
                  <TaskItem key={index}>
                    <div className="text-gray-600 dark:text-gray-400 text-sm">
                      Processing...
                    </div>
                  </TaskItem>
                )
              }

              if (partObj.type === 'complete' || partObj.type === 'finished') {
                return (
                  <TaskItem key={index}>
                    <div className="text-green-600 dark:text-green-400 text-sm">
                      ✓ Complete
                    </div>
                  </TaskItem>
                )
              }

              // Handle error states
              if (partObj.type === 'error' || partObj.type === 'failed') {
                return (
                  <TaskItem key={index}>
                    <div className="text-red-600 dark:text-red-400 text-sm">
                      ✗ {partObj.error || partObj.message || 'Task failed'}
                    </div>
                  </TaskItem>
                )
              }

              // Fallback for other structured data
              // Try to extract meaningful information from unknown task parts
              const taskType = partObj.type || 'unknown'
              const status = partObj.status
              const message =
                partObj.message || partObj.description || partObj.text

              if (message) {
                return (
                  <TaskItem key={index}>
                    <div className="text-gray-700 dark:text-gray-300 text-sm">
                      {message}
                    </div>
                  </TaskItem>
                )
              }

              if (status) {
                return (
                  <TaskItem key={index}>
                    <div className="text-gray-600 dark:text-gray-400 text-sm capitalize">
                      {status.replace(/-/g, ' ')}...
                    </div>
                  </TaskItem>
                )
              }

              // Show task type as a readable label
              if (taskType !== 'unknown') {
                const readableType = taskType
                  .replace(/-/g, ' ')
                  .replace(/([a-z])([A-Z])/g, '$1 $2')
                  .toLowerCase()
                  .replace(/^\w/, (c: string) => c.toUpperCase())

                return (
                  <TaskItem key={index}>
                    <div className="text-gray-600 dark:text-gray-400 text-sm">
                      {readableType}
                    </div>
                  </TaskItem>
                )
              }

              // Final fallback - only show JSON for truly unknown structures
              return (
                <TaskItem key={index}>
                  <details className="text-xs">
                    <summary className="text-gray-500 dark:text-gray-400 cursor-pointer">
                      Unknown task part (click to expand)
                    </summary>
                    <div className="font-mono mt-2 bg-gray-100 dark:bg-gray-800 p-2 rounded">
                      {JSON.stringify(part, null, 2)}
                    </div>
                  </details>
                </TaskItem>
              )
            }

            return null
          })}

        {children && <TaskItem>{children}</TaskItem>}
      </TaskContent>
    </Task>
  )
}

// Wrapper component to adapt AI Elements styling to @v0-sdk/react CodeProjectPart
export const CodeProjectPartWrapper = ({
  title,
  filename,
  code,
  language,
  collapsed,
  className,
  children,
  iconRenderer: _iconRenderer,
  ...props
}: CodeProjectPartProps) => {
  const [isCollapsed, setIsCollapsed] = React.useState(collapsed ?? true)

  return (
    <div
      className={`my-6 border border-border dark:border-input rounded-lg ${className || ''}`}
      {...props}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-black dark:text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {title || 'Code Project'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
            v1
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {!isCollapsed && (
        <div className="border-t border-border dark:border-input">
          {children || (
            <div className="p-4">
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-black dark:text-white">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-mono">
                    {filename || 'app/page.tsx'}
                  </span>
                </div>
              </div>
              {code ? (
                <pre
                  className="overflow-x-auto rounded-md bg-gray-100 dark:bg-gray-900 p-3 text-xs"
                  data-language={language}
                >
                  <code>{code}</code>
                </pre>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No code content available
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Shared components object that can be used by both StreamingMessage and MessageRenderer
// Custom TaskSection that handles code projects properly
type CustomTaskSectionProps = TaskSectionProps & {
  stopped?: { reason?: string }
  integration?: string
  taskNameComplete?: string
  taskNameActive?: string
}

const CustomTaskSectionWrapper = (props: CustomTaskSectionProps) => {
  // Check if this task requires user input (integration requests, etc.)
  const requiresUserInput = props.stopped?.reason === 'user-input-required'

  // Handle task-get-or-request-integration-v1 type specifically
  if (props.type === 'task-get-or-request-integration-v1') {
    const integration = props.integration || 'Integration'
    const title = requiresUserInput
      ? `⚠️ ${integration} Setup Required`
      : props.taskNameComplete || props.taskNameActive || `Setting up ${integration}`

    return (
      <TaskSectionWrapper
        {...props}
        title={title}
      />
    )
  }

  // Handle task-waiting-v1 - don't render these as they're just internal state
  if (props.type === 'task-waiting-v1') {
    return null
  }

  // If this task contains code project parts, render as CodeProjectPart instead
  if (
    props.parts &&
    props.parts.some(
      (part) =>
        part && typeof part === 'object' && part.type === 'code-project',
    )
  ) {
    const codeProjectPart = props.parts.find(
      (part) =>
        part && typeof part === 'object' && part.type === 'code-project',
    )

    if (codeProjectPart) {
      return (
        <CodeProjectPartWrapper
          title={props.title || 'Code Project'}
          filename={codeProjectPart.changedFiles?.[0]?.fileName || 'project'}
          code={codeProjectPart.source || ''}
          language="typescript"
          collapsed={false}
        >
	          {/* Show all files in the project */}
	          {codeProjectPart.changedFiles &&
	            codeProjectPart.changedFiles.length > 0 && (
	              <div className="p-4">
	                <div className="space-y-2">
	                  {codeProjectPart.changedFiles.map(
	                    (file, index: number) => (
	                      <div
	                        key={index}
	                        className="flex items-center gap-2 text-sm text-black dark:text-white"
	                      >
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="font-mono">
                          {file.fileName ||
                            file.baseName ||
                            `file-${index + 1}`}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
        </CodeProjectPartWrapper>
      )
    }
  }

  // Handle task-generate-design-inspiration-v1 and similar design tasks
  if (props.type === 'task-generate-design-inspiration-v1') {
    return (
      <TaskSectionWrapper
        {...props}
        title={props.title || 'Generating Design Inspiration'}
      />
    )
  }

  // Handle other potential new task types
  if (
    props.type &&
    props.type.startsWith('task-') &&
    props.type.endsWith('-v1')
  ) {
    // Extract a readable title from the task type
    const taskName = props.type
      .replace('task-', '')
      .replace('-v1', '')
      .split('-')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    return (
      <TaskSectionWrapper
        {...props}
        title={
          props.title ||
          props.taskNameComplete ||
          props.taskNameActive ||
          taskName
        }
      />
    )
  }

  // Otherwise, use the regular task wrapper
  return <TaskSectionWrapper {...props} />
}

export const sharedComponents = {
  // AI Elements components for structured content
  ThinkingSection: ThinkingSectionWrapper,
  TaskSection: CustomTaskSectionWrapper,
  CodeProjectPart: CodeProjectPartWrapper,
  CodeBlock,
  MathPart,

  // Styled HTML elements for the fastform theme
  p: {
    className: 'mb-4 text-gray-700 dark:text-gray-200 leading-relaxed',
  },
  h1: {
    className: 'mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100',
  },
  h2: {
    className: 'mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100',
  },
  h3: {
    className: 'mb-3 text-lg font-medium text-gray-900 dark:text-gray-100',
  },
  h4: {
    className: 'mb-3 text-base font-medium text-gray-900 dark:text-gray-100',
  },
  h5: {
    className: 'mb-2 text-sm font-medium text-gray-900 dark:text-gray-100',
  },
  h6: {
    className: 'mb-2 text-sm font-medium text-gray-900 dark:text-gray-100',
  },
  ul: {
    className: 'mb-4 ml-6 list-disc space-y-1 text-gray-700 dark:text-gray-200',
  },
  ol: {
    className:
      'mb-4 ml-6 list-decimal space-y-1 text-gray-700 dark:text-gray-200',
  },
  li: {
    className: 'text-gray-700 dark:text-gray-200',
  },
  blockquote: {
    className:
      'mb-4 border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400',
  },
  code: {
    className:
      'rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-sm font-mono text-gray-900 dark:text-gray-100',
  },
  pre: {
    className:
      'mb-4 overflow-x-auto rounded-lg bg-gray-100 dark:bg-gray-800 p-4',
  },
  a: {
    className: 'text-blue-600 dark:text-blue-400 hover:underline',
  },
  strong: {
    className: 'font-semibold text-gray-900 dark:text-gray-100',
  },
  em: {
    className: 'italic text-gray-700 dark:text-gray-300',
  },
}
