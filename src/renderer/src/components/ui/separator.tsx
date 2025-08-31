import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Separator({
  className,
  ...props
}: React.HTMLAttributes<HTMLHRElement>): React.JSX.Element {
  return <hr className={cn('border-t my-2 border-muted', className)} {...props} />
}

export { Separator }
