import {
  createContext,
  useContext,
  Show,
  type JSX,
} from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "./ThemeContext"
import {
  createToastController,
  type ToastContextValue,
  type ToastOptions,
  type ToastVariant,
} from "./toast-controller"

export {
  createToastController,
  type ToastContextValue,
  type ToastOptions,
  type ToastVariant,
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export interface ToastProviderProps {
  children: JSX.Element
}

export function ToastProvider(props: ToastProviderProps) {
  const value = createToastController()

  return (
    <ToastContext.Provider value={value}>
      {props.children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}

export function Toast() {
  const { currentToast } = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  const getBorderColor = (variant: ToastVariant) => {
    switch (variant) {
      case "info": return theme().info
      case "success": return theme().success
      case "warning": return theme().warning
      case "error": return theme().error
      default: return theme().border
    }
  }

  const maxWidth = () => Math.min(50, dimensions().width - 6)

  // Render reactively via <Show> so the toast appears, updates, and auto-hides.
  // (An early `return null` in the body would run once at mount and never react.)
  return (
    <Show when={currentToast()} keyed>
      {(toast) => (
        <box
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: maxWidth(),
            borderStyle: "single",
            borderColor: getBorderColor(toast.variant),
            backgroundColor: theme().backgroundPanel,
            padding: 1,
            flexDirection: "column",
          }}
        >
          {toast.title && (
            <text>
              <span style={{ bold: true, fg: getBorderColor(toast.variant) }}>
                {toast.title}
              </span>
            </text>
          )}
          <text>{toast.message}</text>
        </box>
      )}
    </Show>
  )
}
