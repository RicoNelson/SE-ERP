import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

let isStacktraceReporterInstalled = false

const toStacktraceText = (value: unknown): string | null => {
  if (value instanceof Error) {
    if (value.stack) return value.stack
    return `${value.name}: ${value.message}`
  }

  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const maybeStack = Reflect.get(value, 'stack')
    if (typeof maybeStack === 'string' && maybeStack.trim()) {
      return maybeStack
    }

    const maybeMessage = Reflect.get(value, 'message')
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage
    }
  }

  return null
}

const showStacktraceAlert = (title: string, detail: string) => {
  window.alert(`${title}\n\n${detail}`)
}

const installStacktraceReporter = () => {
  if (isStacktraceReporterInstalled) return
  isStacktraceReporterInstalled = true

  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args)

    const stacktrace = args.map(toStacktraceText).find((value): value is string => Boolean(value))
    if (stacktrace) {
      showStacktraceAlert('Stacktrace (console.error)', stacktrace)
      return
    }

    showStacktraceAlert('Stacktrace (console.error)', args.map((arg) => String(arg)).join('\n'))
  }

  window.addEventListener('error', (event) => {
    const stacktrace =
      toStacktraceText(event.error) ||
      `${event.message}\n${event.filename}:${event.lineno}:${event.colno}`
    showStacktraceAlert('Stacktrace (window.error)', stacktrace)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const stacktrace = toStacktraceText(event.reason) || String(event.reason)
    showStacktraceAlert('Stacktrace (unhandledrejection)', stacktrace)
  })
}

const shouldShowStacktraceAlerts =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_STACKTRACE_ALERTS === 'true'

const checkServiceWorkerUpdate = async () => {
  const registration = await navigator.serviceWorker?.getRegistration()
  if (registration) {
    await registration.update()
  }
}

const resetPwaCache = async () => {
  const registrations = await navigator.serviceWorker?.getRegistrations()
  if (registrations?.length) {
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  const cacheKeys = await caches.keys()
  if (cacheKeys.length) {
    await Promise.all(cacheKeys.map((key) => caches.delete(key)))
  }

  window.location.reload()
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
  })

  void checkServiceWorkerUpdate()
  window.addEventListener('focus', () => {
    void checkServiceWorkerUpdate()
  })
  window.addEventListener('pageshow', () => {
    void checkServiceWorkerUpdate()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkServiceWorkerUpdate()
    }
  })
  window.setInterval(() => {
    void checkServiceWorkerUpdate()
  }, 60_000)
  window.forcePwaRefresh = () => {
    void resetPwaCache()
  }
}

if (shouldShowStacktraceAlerts) {
  installStacktraceReporter()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
