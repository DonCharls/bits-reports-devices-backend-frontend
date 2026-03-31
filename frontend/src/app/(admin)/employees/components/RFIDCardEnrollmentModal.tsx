'use client'

import React, { useState, useEffect } from 'react'
import { X, CreditCard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface RFIDCardEnrollmentModalProps {
  isOpen: boolean
  employeeId: number | null
  employeeName: string
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export default function RFIDCardEnrollmentModal({
  isOpen,
  employeeId,
  employeeName,
  onClose,
  onSuccess,
  onError
}: RFIDCardEnrollmentModalProps) {
  const [step, setStep] = useState<'input' | 'syncing' | 'done' | 'error'>('input')
  const [cardInput, setCardInput] = useState('')
  const [cardResultMsg, setCardResultMsg] = useState('')

  useEffect(() => {
    if (isOpen) {
      setStep('input')
      setCardInput('')
      setCardResultMsg('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleEnrollCard = async () => {
    if (!employeeId) return
    const raw = cardInput.replace(/\D/g, '')
    const cardNumber = parseInt(raw, 10)
    
    if (isNaN(cardNumber) || cardNumber < 1 || cardNumber > 4294967295) {
      setCardResultMsg('Please enter a valid card number (1\u20134294967295)')
      setStep('error')
      return
    }
    
    setStep('syncing')
    try {
      const res = await fetch(`/api/employees/${employeeId}/enroll-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cardNumber }),
      })
      const data = await res.json()
      
      if (data.success) {
        setCardResultMsg(data.message || `Card #${cardNumber} enrolled successfully.`)
        setStep('done')
        onSuccess(data.message || 'RFID badge enrolled successfully.')
      } else {
        setCardResultMsg(data.message || 'Enrollment failed')
        setStep('error')
        onError(data.message || 'Could not enroll badge')
      }
    } catch (error) {
      console.error('Card enrollment error:', error)
      setCardResultMsg('Network error \u2014 could not reach server')
      setStep('error')
      onError('Could not reach the server')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300 transition-all"
        onClick={step !== 'syncing' ? onClose : undefined}
      />

      {/* Modal Container */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 fade-in duration-300">
        
        {/* Header */}
        <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {step === 'input' ? 'Enroll RFID Badge' : step === 'syncing' ? 'Syncing...' : step === 'done' ? 'Badge Enrolled' : 'Enrollment Error'}
              </h3>
              {step === 'input' && (
                <p className="text-[10px] text-red-100 uppercase tracking-widest font-bold mt-0.5">Physical Access Card</p>
              )}
            </div>
          </div>
          {step !== 'syncing' && (
            <button 
              onClick={onClose} 
              className="text-white/70 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-7">
          {step === 'input' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                Enrolling physical badge for <span className="font-bold text-slate-900 px-1 py-0.5 bg-slate-100 rounded-md">{employeeName}</span>.
              </p>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">
                  Card Number
                </label>
                <input
                  type="text"
                  value={cardInput}
                  onChange={e => setCardInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && cardInput.trim()) handleEnrollCard() }}
                  placeholder="e.g. 12345678 or 123-456-78"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 focus:bg-white transition-all shadow-sm"
                  autoFocus
                />
              </div>

              <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3 shadow-sm shadow-amber-600/5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                  Find the number printed on the back of the card, or use a USB reader to automatically scan it. 
                  <strong className="block mt-1 uppercase tracking-tight">Once saved, it syncs to all active terminals.</strong>
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-7">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnrollCard}
                  disabled={!cardInput.replace(/\D/g, '').trim()}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg shadow-red-600/25 transition-colors rounded-xl"
                >
                  Enroll Badge
                </button>
              </div>
            </div>
          )}

          {step === 'syncing' && (
            <div className="flex flex-col items-center py-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="relative mb-5">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-60" />
                <div className="bg-blue-50 text-blue-600 p-4 rounded-full relative shadow-sm">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              </div>
              <p className="text-sm font-bold text-slate-800">Syncing to devices...</p>
              <p className="text-xs text-slate-400 mt-1 px-6 text-center">
                Writing card #{cardInput.replace(/\D/g, '')} to all active devices
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center py-6 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-green-50 text-green-500 p-4 rounded-full mb-4 shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-800 text-center mb-1">{cardResultMsg}</p>
              <p className="text-[11px] text-slate-400 font-medium mb-6">Employee can now tap to enter.</p>
              
              <button
                onClick={onClose}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95 shadow-sm"
              >
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center py-6 animate-in slide-in-from-right-4 duration-300">
              <div className="bg-gradient-to-br from-red-50 to-rose-50 text-red-500 p-4 rounded-full mb-5 shadow-sm border border-red-100">
                <AlertCircle className="w-9 h-9" />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">Enrollment Failed</h4>
              <p className="text-xs font-medium text-slate-500 text-center px-4 leading-relaxed">{cardResultMsg}</p>
              
              <div className="flex gap-3 w-full mt-8">
                <button
                  onClick={() => {
                    setStep('input')
                    setCardResultMsg('')
                  }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all active:scale-95"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-bold rounded-xl transition-all active:scale-95"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
