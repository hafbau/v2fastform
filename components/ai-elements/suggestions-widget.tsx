import { cn } from "@/lib/utils"
import { Suggestions, Suggestion } from "./suggestion"

export const SuggestionsWidget = ({
  setMessage,
  textareaRef,
  className,
} : {
  setMessage: (message: string) => void
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  className?: string
}) => {
  return (
        <div className={cn("max-w-2xl mx-auto mt-2", className)}>
          <Suggestions>
            <Suggestion
              onClick={() => {
                setMessage('Intake form')
                // Submit after setting message
                setTimeout(() => {
                  const form = textareaRef?.current?.form
                  if (form) {
                    form.requestSubmit()
                  }
                }, 0)
              }}
              suggestion="Intake form"
            />
            <Suggestion
              onClick={() => {
                setMessage('Patient referral form')
                // Submit after setting message
                setTimeout(() => {
                  const form = textareaRef?.current?.form
                  if (form) {
                    form.requestSubmit()
                  }
                }, 0)
              }}
              suggestion="Patient referral form"
            />
            <Suggestion
              onClick={() => {
                setMessage('Verification of benefits')
                // Submit after setting message
                setTimeout(() => {
                  const form = textareaRef?.current?.form
                  if (form) {
                    form.requestSubmit()
                  }
                }, 0)
              }}
              suggestion="Verification of benefits"
            />
            <Suggestion
              onClick={() => {
                setMessage('Consent form')
                // Submit after setting message
                setTimeout(() => {
                  const form = textareaRef?.current?.form
                  if (form) {
                    form.requestSubmit()
                  }
                }, 0)
              }}
              suggestion="Consent form"
            />
            <Suggestion
              onClick={() => {
                setMessage('Provider matching app')
                // Submit after setting message
                setTimeout(() => {
                  const form = textareaRef?.current?.form
                  if (form) {
                    form.requestSubmit()
                  }
                }, 0)
              }}
              suggestion="Provider matching app"
            />
            <Suggestion
              onClick={() => {
                setMessage('Client portal')
                // Submit after setting message
                setTimeout(() => {
                  const form = textareaRef?.current?.form
                  if (form) {
                    form.requestSubmit()
                  }
                }, 0)
              }}
              suggestion="Client portal"
            />
            <Suggestion
              onClick={() => {
                setMessage('AI intake assistant')
                // Submit after setting message
                setTimeout(() => {
                  const form = textareaRef?.current?.form
                  if (form) {
                    form.requestSubmit()
                  }
                }, 0)
              }}
              suggestion="AI intake assistant"
            />
            <Suggestion
              onClick={() => {
                setMessage('Internal portal')
                // Submit after setting message
                setTimeout(() => {
                  const form = textareaRef?.current?.form
                  if (form) {
                    form.requestSubmit()
                  }
                }, 0)
              }}
              suggestion="Internal portal"
            />
          </Suggestions>
        </div>
      )
    }
