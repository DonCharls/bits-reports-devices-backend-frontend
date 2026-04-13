import { useState } from 'react'

export type ToastType = 'success' | 'warning' | 'error'

export type Toast = {
  id: number
  type: ToastType
  title: string
  message: string
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (type: ToastType, title: string, message: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, title, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return { toasts, showToast, dismissToast }
}
