'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  X, Fingerprint, Loader2, Plus, Trash2, CheckCircle2,
  AlertTriangle, Smartphone, Info, RefreshCw, WifiOff, Check
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

interface FingerprintSlot {
  slot: number
  label: string
  fingerIndex: number | null
  enrolled: boolean
  devices: DeviceSyncStatus[]
}

interface FingerprintDashboardModalProps {
  isOpen: boolean
  employeeId: number | null
  employeeName: string
  onClose: () => void
  onScanNow: (fingerIndex: number, deviceId: number) => void
}

export default function FingerprintDashboardModal({
  isOpen,
  employeeId,
  employeeName,
  onClose,
  onScanNow
}: FingerprintDashboardModalProps) {
  const [loading, setLoading] = useState(true)
  const [slots, setSlots] = useState<FingerprintSlot[]>([])
  const [allDevices, setAllDevices] = useState<{ id: number; name: string; isActive: boolean; syncEnabled: boolean }[]>([])
  const [summary, setSummary] = useState({ totalEnrolled: 0, maxSlots: 3, canEnrollMore: true })

  // Action states
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showDevicePicker, setShowDevicePicker] = useState<number | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/fingerprint-status`)
      const data = await res.json()
      if (data.success) {
        setSlots(data.slots || [])
        setAllDevices(data.allDevices || [])
        setSummary(data.summary || { totalEnrolled: 0, maxSlots: 3, canEnrollMore: true })
      }
    } catch (err) {
      console.error('Failed to load fingerprint status', err)
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    if (isOpen) {
      setShowDevicePicker(null)
      setSelectedDeviceId(null)
      setSyncResult(null)
      fetchStatus()
    }
  }, [isOpen, fetchStatus])

  if (!isOpen || !employeeId) return null

  const handleDelete = async (fingerIndex: number) => {
    setDeletingKey(`${fingerIndex}-global`)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/employees/${employeeId}/fingerprint/${fingerIndex}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setSyncResult({ success: true, message: 'Fingerprint successfully removed from all devices.' })
        await fetchStatus()
      } else {
        setSyncResult({ success: false, message: data.message || 'Failed to delete fingerprint. Some devices may still hold the record.' })
      }
    } catch {
      setSyncResult({ success: false, message: 'Network error while globally deleting fingerprint' })
    } finally {
      setDeletingKey(null)
      setConfirmDelete(null)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/employees/${employeeId}/sync-fingerprints`, {
        method: 'POST'
      })
      const data = await res.json()
      setSyncResult({
        success: data.success,
        message: data.message || (data.success ? 'Sync complete' : 'Sync failed')
      })
      if (data.success) {
        await fetchStatus()
      }
    } catch {
      setSyncResult({ success: false, message: 'Network error during sync' })
    } finally {
      setSyncing(false)
    }
  }

  const startEnrollment = () => {
    if (!selectedDeviceId || showDevicePicker === null) return
    // Use the slot's fingerIndex as the device finger slot, or derive a new one
    const usedIndices = slots.filter(s => s.fingerIndex !== null).map(s => s.fingerIndex!)
    let nextFingerIndex = 0
    while (usedIndices.includes(nextFingerIndex) && nextFingerIndex < 10) nextFingerIndex++
    const fingerIndex = showDevicePicker >= 0 && showDevicePicker < slots.length
      ? (slots[showDevicePicker].fingerIndex ?? nextFingerIndex)
      : nextFingerIndex
    onScanNow(fingerIndex, selectedDeviceId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-red-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Fingerprint className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Fingerprint Management</h3>
              <p className="text-[10px] text-red-100 uppercase tracking-widest font-bold mt-0.5">
                {employeeName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-red-100 font-bold bg-white/10 px-2 py-1 rounded-lg">
              {summary.totalEnrolled}/{summary.maxSlots} slots
            </span>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Device Picker Overlay */}
        {showDevicePicker !== null && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col">
            <div className="p-4 border-b flex items-center gap-3 bg-slate-50">
              <button
                onClick={() => setShowDevicePicker(null)}
                className="p-2 hover:bg-slate-200 rounded-lg text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
              <div>
                <h4 className="font-bold text-slate-800">Select Device</h4>
                <p className="text-xs text-slate-500">Choose which device to enroll on</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {allDevices.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-8">No active devices found.</p>
              ) : (
                allDevices.map(device => {
                  const isDeviceActive = device.isActive
                  return (
                    <button
                      key={device.id}
                      disabled={!isDeviceActive}
                      onClick={() => setSelectedDeviceId(device.id)}
                      className={`w-full flex items-center justify-between p-4 border rounded-xl transition-all text-left ${
                        !isDeviceActive ? 'opacity-50 cursor-not-allowed bg-slate-50' :
                        selectedDeviceId === device.id ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : 'hover:border-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className={`w-5 h-5 ${isDeviceActive ? 'text-slate-700' : 'text-slate-400'}`} />
                        <div>
                          <p className="text-sm font-bold text-slate-800">{device.name}</p>
                          {!isDeviceActive ? (
                            <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                              <WifiOff className="w-3 h-3" /> Offline
                            </p>
                          ) : !device.syncEnabled ? (
                            <p className="text-xs text-amber-500 font-medium">Sync Paused</p>
                          ) : (
                            <p className="text-xs text-green-500 font-medium flex items-center gap-1">
                              <Check className="w-3 h-3" /> Online & Ready
                            </p>
                          )}
                        </div>
                      </div>
                      {selectedDeviceId === device.id && (
                        <CheckCircle2 className="w-5 h-5 text-red-600" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
            <div className="p-4 border-t bg-slate-50">
              <button
                disabled={!selectedDeviceId}
                onClick={startEnrollment}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 rounded-xl transition-colors shadow-lg"
              >
                Start Scanning on Device
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Overlay */}
        {confirmDelete !== null && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 mb-5 shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-black text-slate-800 mb-2">Delete Fingerprint?</h4>
            <p className="text-sm text-slate-500 mb-8 max-w-sm leading-relaxed">
              This will permanently delete the fingerprint from the database and queue a removal command for all online devices. <br/><span className="font-bold text-red-500">This action cannot be undone.</span>
            </p>
            <div className="flex gap-3 w-full max-w-xs">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors"
                disabled={deletingKey !== null}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                disabled={deletingKey !== null}
              >
                {deletingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-4" />
              <p className="text-sm font-medium text-slate-500">Loading fingerprint data...</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Info Banner */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 text-blue-800 rounded-2xl border border-blue-100">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm leading-relaxed">
                  <p className="font-bold mb-1">Up to {summary.maxSlots} fingerprints per employee</p>
                  Enroll any finger. Use Sync to push fingerprints to devices that missed updates while offline.
                </div>
              </div>

              {/* Sync Result */}
              {syncResult && (
                <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
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

              {/* Sync All Button */}
              {summary.totalEnrolled > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    {syncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {syncing ? 'Syncing...' : 'Sync Fingerprints'}
                  </button>
                </div>
              )}

              {/* Fingerprint Slots */}
              <div className="grid grid-cols-1 gap-4">
                {slots.map((slot) => {
                  if (slot.enrolled) {
                    return (
                      <div key={slot.slot} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                        {/* Slot Header */}
                        <div className="bg-slate-50 px-4 py-3 border-b flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Fingerprint className="w-4 h-4 text-red-500" />
                            <h4 className="font-bold text-slate-700 text-sm">{slot.label}</h4>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 uppercase tracking-wider">
                              Enrolled
                            </span>
                            <button
                              disabled={deletingKey === `${slot.fingerIndex}-global`}
                              onClick={() => slot.fingerIndex !== null && setConfirmDelete(slot.fingerIndex)}
                              className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 flex items-center gap-1 rounded-lg transition-colors border border-transparent hover:border-red-200"
                              title="Globally delete this fingerprint"
                            >
                              {deletingKey === `${slot.fingerIndex}-global` ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              Delete Global Fingerprint
                            </button>
                          </div>
                        </div>

                        {/* Device List */}
                        <div className="p-2 space-y-1">
                          {slot.devices.map(device => (
                            <div key={device.deviceId} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-3">
                                <Smartphone className={`w-4 h-4 ${device.enrolled ? 'text-slate-500' : 'text-slate-300'}`} />
                                <div>
                                  <p className={`text-sm font-medium ${device.pendingDeletion ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                    {device.deviceName}
                                  </p>
                                  {device.pendingDeletion ? (
                                    <p className="text-[10px] text-red-400 font-bold flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" /> Pending offline deletion...
                                    </p>
                                  ) : device.enrolled ? (
                                    <p className="text-[10px] text-green-600 font-medium">
                                      Synced {device.enrolledAt ? `on ${new Date(device.enrolledAt).toLocaleDateString()}` : ''}
                                    </p>
                                  ) : device.isActive ? (
                                    <p className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" /> Not synced
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                      <WifiOff className="w-3 h-3" /> Device offline
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }

                  // Empty slot
                  if (summary.canEnrollMore) {
                    return (
                      <button
                        key={slot.slot}
                        onClick={() => setShowDevicePicker(slot.slot - 1)}
                        className="border-2 border-dashed border-slate-200 hover:border-red-300 hover:bg-red-50/50 bg-white rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-50 group-hover:bg-red-100 flex items-center justify-center text-slate-400 group-hover:text-red-500 mb-1 transition-colors">
                          <Plus className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-600 group-hover:text-red-600 text-sm">
                          {slot.label}
                        </h4>
                        <p className="text-xs text-slate-400">Available for enrollment</p>
                      </button>
                    )
                  }

                  return null
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
