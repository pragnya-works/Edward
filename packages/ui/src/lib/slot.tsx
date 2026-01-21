import * as React from "react"

interface SlotProps {
  children?: React.ReactNode
}

export const Slot = React.forwardRef<HTMLElement, SlotProps>((props, ref) => {
  const { children, ...slotProps } = props

  if (React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...mergeProps(slotProps, children.props),
      ref: ref ? composeRefs(ref, (children as any).ref) : (children as any).ref,
    } as any)
  }

  return React.Children.count(children) > 1 ? React.Children.only(null) : null
})

Slot.displayName = "Slot"

function mergeProps(slotProps: any, childProps: any) {
  // all child props should override slot props
  const overrideProps = { ...childProps }

  for (const propName in childProps) {
    const slotPropValue = slotProps[propName]
    const childPropValue = childProps[propName]

    const isHandler = /^on[A-Z]/.test(propName)
    if (isHandler) {
      // if the handler exists on both, we compose them
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args: any[]) => {
          childPropValue(...args)
          slotPropValue(...args)
        }
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue
      }
    } else if (propName === "style") {
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = { ...slotPropValue, ...childPropValue }
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue
      }
    } else if (propName === "className") {
      overrideProps[propName] = [slotPropValue, childPropValue]
        .filter(Boolean)
        .join(" ")
    }
  }

  return { ...slotProps, ...overrideProps }
}

function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(node)
      } else if (ref != null) {
        ;(ref as React.MutableRefObject<T>).current = node
      }
    })
  }
}
