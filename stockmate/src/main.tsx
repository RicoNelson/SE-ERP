import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
