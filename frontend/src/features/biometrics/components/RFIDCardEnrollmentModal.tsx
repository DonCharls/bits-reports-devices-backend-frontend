'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  X, CreditCard, Loader2, Trash2, CheckCircle2,
  AlertTriangle, Smartphone, Info, RefreshCw, WifiOff, Check, UploadCloud
} from 'lucide-react'

interface DeviceSyncStatus {
  deviceId: number
  deviceName: string
  enrolled: boolean
  enrolledAt?: string
  isActive: boolean
  syncEnabled: boolean
  pendingDeletion: boolean
}

interface CardStatusResponse {
  success: boolean
  employee: {
    id: number
    name: string
    cardNumber: number | null
  }
  devices: DeviceSyncStatus[]
}

interface RFIDCardEnrollmentModalProps {
  isOpen: boolean
  employeeId: number | null
  employeeName: string
  currentCard?: number | null // Used to prepopulate but we fetch truth from API
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export default function RFIDCardEnrollmentModal({
  isOpen,
  employeeId,
  employeeName,
  currentCard,
  onClose,
  onSuccess,
  onError
}: RFIDCardEnrollmentModalProps) {
  const [loading, setLoading] = useState(true)
  const [cardNumber, setCardNumber] = useState<number | null>(null)
  const [devices, setDevices] = useState<DeviceSyncStatus[]>([])

  // Action states
  const [cardInput, setCardInput] = useState('')
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)
  const [detailedResults, setDetailedResults] = useState<{ deviceName: string; status: 'synced' | 'failed'; error?: string }[] | null>(null)
  
  // Track ongoing granular actions
  const [activeActions, setActiveActions] = useState<{ [key: string]: boolean }>({})
  const [confirmGlobalDelete, setConfirmGlobalDelete] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/card-status`)
      const data: CardStatusResponse = await res.json()
      if (data.success) {
        setCardNumber(data.employee.cardNumber)
        setDevices(data.devices || [])
        // If they had a card initially, populate the input just in case they lose it
        if (data.employee.cardNumber) {
          setCardInput(data.employee.cardNumber.toString())
        }
      }
    } catch (err) {
      console.error('Failed to load card status', err)
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  // Optimistically mark active+sync-enabled devices (or a specific device) as synced
  // right after the API confirms success. A deferred re-fetch then reconciles with the DB.
  const optimisticallySetEnrolled = useCallback((enrolledCardNumber: number, targetDeviceId?: number) => {
    const now = new Date().toISOString()
    setCardNumber(enrolledCardNumber)
    setDevices(prev => prev.map(d => {
      if (targetDeviceId !== undefined) {
        // Per-device push: only update the target device
        return d.deviceId === targetDeviceId
          ? { ...d, enrolled: true, enrolledAt: now, pendingDeletion: false }
          : d
      }
      // Global enroll: mark all active+sync-enabled devices as synced
      if (d.isActive && d.syncEnabled) {
        return { ...d, enrolled: true, enrolledAt: now, pendingDeletion: false }
      }
      return d
    }))
  }, [])

  useEffect(() => {
    if (isOpen) {
      setSyncResult(null)
      setDetailedResults(null)
      setCardInput('')
      setConfirmGlobalDelete(false)
      setActiveActions({})
      fetchStatus()
    }
  }, [isOpen, fetchStatus])

  if (!isOpen || !employeeId) return null

  // -------------------------
  // ACTIONS
  // -------------------------

  const handleGlobalEnroll = async () => {
    if (!employeeId) return
    const raw = cardInput.replace(/\D/g, '')
    const parsedNumber = parseInt(raw, 10)
    
    if (isNaN(parsedNumber) || parsedNumber < 1 || parsedNumber > 4294967295) {
      setSyncResult({ success: false, message: 'Please enter a valid card number (1–4294967295)' })
      return
    }
    
    setActiveActions(prev => ({ ...prev, globalEnroll: true }))
    setSyncResult(null)
    setDetailedResults(null)
    
    try {
      const res = await fetch(`/api/employees/${employeeId}/enroll-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNumber: parsedNumber }),
      })
      const data = await res.json()
      
      if (data.results) setDetailedResults(data.results)

      if (data.success) {
        setSyncResult({ success: true, message: data.message || 'Card enrolled globally successfully.' })
        onSuccess(data.message || 'Card enrolled successfully.')
        // Immediately update state so the UI reflects synced status without waiting for re-fetch
        optimisticallySetEnrolled(parsedNumber)
        // Deferred reconciliation giving the backend queue time to write to DB
        setTimeout(() => fetchStatus(), 3000)
      } else {
        setSyncResult({ success: false, message: data.message || 'Global enrollment failed' })
      }
    } catch (error) {
      setSyncResult({ success: false, message: 'Network error while enrolling card' })
    } finally {
      setActiveActions(prev => ({ ...prev, globalEnroll: false }))
    }
  }

  const handleManualSync = async () => {
    if (!employeeId || !cardNumber) return
    
    setActiveActions(prev => ({ ...prev, manualSync: true }))
    setSyncResult(null)
    setDetailedResults(null)
    
    try {
      const res = await fetch(`/api/employees/${employeeId}/enroll-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNumber }),
      })
      const data = await res.json()
      
      if (data.results) setDetailedResults(data.results)

      if (data.success) {
        setSyncResult({ success: true, message: data.message || 'Sync complete.' })
        if (cardNumber) optimisticallySetEnrolled(cardNumber)
        setTimeout(() => fetchStatus(), 3000)
      } else {
        setSyncResult({ success: false, message: data.message || 'Sync failed.' })
      }
    } catch (error) {
      setSyncResult({ success: false, message: 'Network error while syncing card' })
    } finally {
      setActiveActions(prev => ({ ...prev, manualSync: false }))
    }
  }

  const handleGlobalDelete = async () => {
    setActiveActions(prev => ({ ...prev, globalDelete: true }))
    setSyncResult(null)
    try {
      const res = await fetch(`/api/employees/${employeeId}/card`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setSyncResult({ success: true, message: 'Card successfully removed from all devices.' })
        onSuccess(data.message || 'Badge removed successfully.')
        setCardInput('')
        await fetchStatus()
      } else {
        setSyncResult({ success: false, message: data.message || 'Failed to delete card.' })
      }
    } catch {
      setSyncResult({ success: false, message: 'Network error while globally deleting card' })
    } finally {
      setActiveActions(prev => ({ ...prev, globalDelete: false }))
      setConfirmGlobalDelete(false)
    }
  }

  const handlePushToDevice = async (deviceId: number) => {
    setActiveActions(prev => ({ ...prev, [`push-${deviceId}`]: true }))
    setSyncResult(null)
    try {
      const res = await fetch(`/api/employees/${employeeId}/enroll-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNumber, deviceId }),
      })
      const data = await res.json()
      if (data.success) {
        setSyncResult({ success: true, message: `Card pushed to device successfully.` })
        if (cardNumber) optimisticallySetEnrolled(cardNumber, deviceId)
        setTimeout(() => fetchStatus(), 3000)
      } else {
        setSyncResult({ success: false, message: data.message || 'Push to device failed' })
      }
    } catch {
      setSyncResult({ success: false, message: 'Network error while pushing to device' })
    } finally {
      setActiveActions(prev => ({ ...prev, [`push-${deviceId}`]: false }))
    }
  }

  const handleDeleteFromDevice = async (deviceId: number) => {
    setActiveActions(prev => ({ ...prev, [`delete-${deviceId}`]: true }))
    setSyncResult(null)
    try {
      const res = await fetch(`/api/employees/${employeeId}/card/device/${deviceId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setSyncResult({ success: true, message: `Card removed from device successfully.` })
        // Optimistically mark that specific device as unenrolled
        setDevices(prev => prev.map(d =>
          d.deviceId === deviceId ? { ...d, enrolled: false, enrolledAt: undefined } : d
        ))
        setTimeout(() => fetchStatus(), 3000)
      } else {
        setSyncResult({ success: false, message: data.message || 'Removal from device failed' })
      }
    } catch {
      setSyncResult({ success: false, message: 'Network error while removing from device' })
    } finally {
      setActiveActions(prev => ({ ...prev, [`delete-${deviceId}`]: false }))
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-red-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">RFID Card Management</h3>
              <p className="text-[10px] text-red-100 uppercase tracking-widest font-bold mt-0.5">
                {employeeName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Delete Confirmation Overlay */}
        {confirmGlobalDelete && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 mb-5 shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-black text-slate-800 mb-2">Delete Global Card?</h4>
            <p className="text-sm text-slate-500 mb-8 max-w-sm leading-relaxed">
              This will permanently delete the RFID card from the database and queue a removal command for all online devices. <br/><span className="font-bold text-red-500">This action cannot be undone.</span>
            </p>
            <div className="flex gap-3 w-full max-w-xs">
              <button
                onClick={() => setConfirmGlobalDelete(false)}
                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors"
                disabled={activeActions['globalDelete']}
              >
                Cancel
              </button>
              <button
                onClick={handleGlobalDelete}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                disabled={activeActions['globalDelete']}
              >
                {activeActions['globalDelete'] ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-4" />
              <p className="text-sm font-medium text-slate-500">Loading card data...</p>
            </div>
          ) : (
            <div className="space-y-5">
              
              {/* Sync Result */}
              {syncResult && (
                <div className={`flex items-start gap-3 p-4 rounded-2xl border transition-all ${
                  syncResult.success
                    ? 'bg-green-50 text-green-800 border-green-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}>
                  {syncResult.success ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm font-medium">{syncResult.message}</p>
                </div>
              )}

              {/* Detailed Summary (Post-Enrollment) */}
              {detailedResults && detailedResults.length > 0 && (
                <div className="bg-white rounded-2xl border p-4 space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Sync Report</h4>
                  {detailedResults.map((result, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-transparent">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-bold text-slate-700">{result.deviceName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {result.status === 'synced' ? (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-100 text-green-700 text-xs font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Success
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 text-red-700 text-xs font-bold">
                            <X className="w-3 h-3" /> Failed
                          </span>
                        )}
                        {result.error && <span className="text-[10px] text-red-500 max-w-[120px] truncate" title={result.error}>({result.error})</span>}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setDetailedResults(null)} className="w-full mt-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
                    Dismiss Report
                  </button>
                </div>
              )}

              {/* CARD INPUT / ENROLLMENT AREA */}
              {!cardNumber ? (
                <div className="space-y-4">
                  <div className="bg-white p-6 rounded-2xl border shadow-sm flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4">
                      <CreditCard className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-slate-800 mb-1">No Card Enrolled</h3>
                    <p className="text-sm text-slate-500 mb-6 max-w-sm">
                      Enter the RFID card number to register it globally for this employee across all active devices.
                    </p>
                    
                    <div className="w-full max-w-sm flex gap-2">
                      <input
                        type="text"
                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-red-500 focus:outline-none transition-all"
                        placeholder="Enter Card Number..."
                        value={cardInput}
                        onChange={(e) => setCardInput(e.target.value.replace(/\D/g, ''))}
                      />
                      <button
                        onClick={handleGlobalEnroll}
                        disabled={!cardInput || activeActions['globalEnroll']}
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors shadow-lg flex-shrink-0 flex items-center justify-center min-w-[100px]"
                      >
                        {activeActions['globalEnroll'] ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enroll'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Pre-enrollment target specific list */}
                  <div className="bg-white rounded-2xl border shadow-sm p-4">
                     <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Target Devices</h4>
                     <p className="text-[10px] text-slate-400 mb-3 px-1">Enrolling the card will push to the following active devices instantly:</p>
                     <div className="space-y-1.5">
                      {devices.length === 0 ? (
                        <p className="text-center text-sm text-slate-500 py-4">No active devices found.</p>
                      ) : (
                        devices.map(device => (
                          <div key={device.deviceId} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-transparent">
                            <div className="flex items-center gap-3">
                              <Smartphone className={`w-4 h-4 ${device.isActive && device.syncEnabled ? 'text-red-500' : 'text-slate-400'}`} />
                              <div>
                                <span className="text-sm font-bold text-slate-700">{device.deviceName}</span>
                                {!device.isActive ? (
                                  <span className="ml-2 text-[10px] text-red-500 font-bold bg-red-100 px-1.5 py-0.5 rounded-md">Offline</span>
                                ) : !device.syncEnabled ? (
                                  <span className="ml-2 text-[10px] text-amber-600 font-bold bg-amber-100 px-1.5 py-0.5 rounded-md">Sync Paused</span>
                                ) : (
                                  <span className="ml-2 text-[10px] text-green-600 font-bold bg-green-100 px-1.5 py-0.5 rounded-md">Ready</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                     </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  {/* Card Header */}
                  <div className="bg-slate-50 px-4 py-4 border-b flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-lg tracking-tight">#{cardNumber}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Global Card</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Sync Visual Indicator Pill */}
                      {(() => {
                        const targetable = devices.filter(d => d.isActive && d.syncEnabled);
                        const enrolled = targetable.filter(d => d.enrolled && !d.pendingDeletion);
                        if (targetable.length === 0) return null;
                        
                        if (enrolled.length === targetable.length) {
                           return <span className="px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-lg uppercase tracking-widest flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Fully Synced</span>;
                        } else {
                           return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-lg uppercase tracking-widest flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing {targetable.length - enrolled.length} Device(s)</span>;
                        }
                      })()}
                      <button
                        onClick={() => setConfirmGlobalDelete(true)}
                        className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 flex items-center gap-1.5 rounded-xl transition-colors border border-transparent hover:border-red-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Global
                      </button>
                    </div>
                  </div>

                  {/* Device List Header w/ Manual Sync */}
                  <div className="px-4 pt-3 flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Device Synchronization</h5>
                    <button
                      onClick={handleManualSync}
                      disabled={activeActions['manualSync']}
                      className="flex items-center gap-1.5 px-3 py-1.5 border hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-lg transition-colors shadow-sm"
                    >
                      {activeActions['manualSync'] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Sync All
                    </button>
                  </div>

                  {/* Device List */}
                  <div className="p-3 bg-white">
                    <div className="space-y-1.5">
                      {devices.length === 0 ? (
                        <p className="text-center text-sm text-slate-500 py-4">No active devices found in the system.</p>
                      ) : (
                        devices.map(device => (
                          <div key={device.deviceId} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                            <div className="flex items-center gap-3">
                              <Smartphone className={`w-4 h-4 ${device.enrolled ? 'text-red-500' : 'text-slate-300'}`} />
                              <div>
                                <p className={`text-sm font-bold ${device.pendingDeletion ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                  {device.deviceName}
                                </p>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    {device.pendingDeletion ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[9px] font-bold uppercase tracking-wider border border-red-100">
                                        <AlertTriangle className="w-2.5 h-2.5" /> Pending Delete
                                      </span>
                                    ) : device.enrolled ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase tracking-wider border border-emerald-100">
                                        <Check className="w-2.5 h-2.5" /> Synced {device.enrolledAt ? `(${new Date(device.enrolledAt).toLocaleDateString()})` : ''}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase tracking-wider border border-amber-100">
                                        <AlertTriangle className="w-2.5 h-2.5" /> Not Synced
                                      </span>
                                    )}

                                    {!device.isActive && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-bold uppercase tracking-wider border border-slate-200">
                                        <WifiOff className="w-2.5 h-2.5" /> Offline
                                      </span>
                                    )}
                                  </div>
                              </div>
                            </div>

                            {/* Actions per device */}
                            {device.isActive && device.syncEnabled && (
                              <div className="flex items-center">
                                {device.enrolled && !device.pendingDeletion ? (
                                  <button
                                    onClick={() => handleDeleteFromDevice(device.deviceId)}
                                    disabled={activeActions[`delete-${device.deviceId}`]}
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
                                    title="Remove from this device"
                                  >
                                    {activeActions[`delete-${device.deviceId}`] ? 
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" /> : 
                                      <Trash2 className="w-3.5 h-3.5" />
                                    }
                                  </button>
                                ) : !device.pendingDeletion ? (
                                  <button
                                    onClick={() => handlePushToDevice(device.deviceId)}
                                    disabled={activeActions[`push-${device.deviceId}`]}
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5 border border-transparent shadow-sm bg-white"
                                    title="Push to this device"
                                  >
                                    {activeActions[`push-${device.deviceId}`] ? 
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 
                                      <UploadCloud className="w-3.5 h-3.5" />
                                    }
                                    <span className="text-xs font-bold mr-1">Push</span>
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
