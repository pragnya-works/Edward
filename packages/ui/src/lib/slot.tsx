import * as React from "react"

interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode
}

export const Slot = React.forwardRef<HTMLElement, SlotProps>((props, ref) => {
  const { children, ...slotProps } = props

  if (React.isValidElement(children)) {
    const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>> & {
      ref?: React.Ref<HTMLElement>
    }

    return React.cloneElement(child, {
      ...mergeProps(slotProps, child.props),
      ref: ref ? composeRefs(ref, child.ref) : child.ref,
    } as React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>)
  }

  return React.Children.count(children) > 1 ? React.Children.only(null) : null
})

Slot.displayName = "Slot"

function mergeProps(
  slotProps: React.HTMLAttributes<HTMLElement>,
  childProps: React.HTMLAttributes<HTMLElement>
): React.HTMLAttributes<HTMLElement> {
  const result: React.HTMLAttributes<HTMLElement> = { ...slotProps, ...childProps }

  if (slotProps.className && childProps.className) {
    result.className = `${slotProps.className} ${childProps.className}`
  }
  if (slotProps.style && childProps.style) {
    result.style = { ...slotProps.style, ...childProps.style }
  }

  for (const key in slotProps) {
    if (key.startsWith("on") && key in childProps) {
      const slotHandler = slotProps[key as keyof React.HTMLAttributes<HTMLElement>]
      const childHandler = childProps[key as keyof React.HTMLAttributes<HTMLElement>]

      if (typeof slotHandler === "function" && typeof childHandler === "function") {
        const mergedHandler = (event: React.SyntheticEvent) => {
          (childHandler as React.EventHandler<React.SyntheticEvent>)(event);
          (slotHandler as React.EventHandler<React.SyntheticEvent>)(event);
        }
        (result as Record<string, typeof mergedHandler>)[key] = mergedHandler
      }
    }
  }

  return result
}

function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(node)
      } else if (ref != null && typeof ref === "object" && "current" in ref) {
          (ref as React.MutableRefObject<T>).current = node
      }
    })
  }
}
