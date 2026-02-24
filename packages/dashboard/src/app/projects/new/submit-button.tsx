'use client'

import { useFormStatus } from 'react-dom'
import { Loader2, ArrowRight } from 'lucide-react'

export function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating...
        </>
      ) : (
        <>
          Create Project
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </button>
  )
}
