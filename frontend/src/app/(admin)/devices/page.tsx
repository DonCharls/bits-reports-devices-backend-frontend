'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
    Wifi, WifiOff, Plus, Pencil, Trash2, X, Check,
    Server, MapPin, RadioTower, Loader2, AlertCircle, RefreshCw,
    ChevronRight, Activity
} from 'lucide-react'

interface Device {
    id: number
    name: string
    ip: string
    port: number
    location: string | null
    isActive: boolean
    syncEnabled: boolean
    createdAt: string
    updatedAt: string
}

interface FormState {
    name: string
    ip: string
    port: string
    location: string
}

const EMPTY_FORM: FormState = { name: '', ip: '', port: '4370', location: '' }

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Modal state
    const [showModal, setShowModal] = useState(false)
    const [editingDevice, setEditingDevice] = useState<Device | null>(null)
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    // Delete confirm
    const [deletingId, setDeletingId] = useState<number | null>(null)
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

    // Test connection state
    const [testingId, setTestingId] = useState<number | null>(null)
    const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string; info?: any }>>({})

    // Toggle sync state
    const [togglingId, setTogglingId] = useState<number | null>(null)

    // Toast
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok })
        setTimeout(() => setToast(null), 4000)
    }

    const fetchDevices = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/devices', { credentials: 'include' })
            const data = await res.json()
            if (data.success) setDevices(data.devices)
            else setError(data.message || 'Failed to fetch devices')
        } catch (e: any) {
            setError(e.message || 'Network error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchDevices() }, [fetchDevices])

    const openAdd = () => {
        setEditingDevice(null)
        setForm(EMPTY_FORM)
        setFormError(null)
        setShowModal(true)
    }

    const openEdit = (device: Device) => {
        setEditingDevice(device)
        setForm({ name: device.name, ip: device.ip, port: String(device.port), location: device.location || '' })
        setFormError(null)
        setShowModal(true)
    }

    const closeModal = () => {
        setShowModal(false)
        setEditingDevice(null)
        setForm(EMPTY_FORM)
        setFormError(null)
    }

    const handleSave = async () => {
        if (!form.name.trim()) { setFormError('Device name is required'); return }
        if (!form.ip.trim()) { setFormError('IP address is required'); return }
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(form.ip.trim())) { setFormError('Invalid IP address format (e.g. 192.168.1.201)'); return }
        const port = parseInt(form.port)
        if (isNaN(port) || port < 1 || port > 65535) { setFormError('Port must be between 1 and 65535'); return }

        setSaving(true)
        setFormError(null)
        try {
            const url = editingDevice ? `/api/devices/${editingDevice.id}` : '/api/devices'
            const method = editingDevice ? 'PUT' : 'POST'
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: form.name.trim(), ip: form.ip.trim(), port, location: form.location.trim() || null })
            })
            const data = await res.json()
            if (data.success) {
                showToast(data.message || (editingDevice ? 'Device updated' : 'Device added'))
                closeModal()
                fetchDevices()
            } else {
                setFormError(data.message || 'Failed to save device')
            }
        } catch (e: any) {
            setFormError(e.message || 'Network error')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: number) => {
        setDeletingId(id)
        try {
            const res = await fetch(`/api/devices/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            })
            const data = await res.json()
            if (data.success) {
                showToast(data.message || 'Device removed')
                setDeleteConfirmId(null)
                fetchDevices()
            } else {
                showToast(data.message || 'Failed to delete device', false)
            }
        } catch (e: any) {
            showToast(e.message || 'Network error', false)
        } finally {
            setDeletingId(null)
        }
    }

    const handleTest = async (device: Device) => {
        setTestingId(device.id)
        setTestResults(prev => ({ ...prev, [device.id]: { success: false, message: 'Connecting...' } }))
        try {
            const res = await fetch(`/api/devices/${device.id}/test`, {
                method: 'POST',
                credentials: 'include'
            })
            const data = await res.json()
            setTestResults(prev => ({ ...prev, [device.id]: { success: data.success, message: data.message, info: data.info } }))
            fetchDevices() // Refresh to show updated isActive
        } catch (e: any) {
            setTestResults(prev => ({ ...prev, [device.id]: { success: false, message: e.message || 'Connection failed' } }))
        } finally {
            setTestingId(null)
        }
    }

    const handleToggleSync = async (device: Device) => {
        setTogglingId(device.id)
        // Optimistic update
        setDevices(prev => prev.map(d =>
            d.id === device.id ? { ...d, syncEnabled: !d.syncEnabled } : d
        ))
        try {
            const res = await fetch(`/api/devices/${device.id}/toggle`, {
                method: 'PATCH',
                credentials: 'include'
            })
            const data = await res.json()
            if (!data.success) {
                // Revert on failure
                setDevices(prev => prev.map(d =>
                    d.id === device.id ? { ...d, syncEnabled: device.syncEnabled } : d
                ))
                showToast(data.message || 'Failed to toggle sync', false)
            } else {
                showToast(data.message, data.device.syncEnabled)
            }
        } catch (e: any) {
            setDevices(prev => prev.map(d =>
                d.id === device.id ? { ...d, syncEnabled: device.syncEnabled } : d
            ))
            showToast(e.message || 'Network error', false)
        } finally {
            setTogglingId(null)
        }
    }

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <RadioTower className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-foreground">Biometric Devices</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">Manage ZKTeco device configurations</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchDevices} className="gap-2 border-border">
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </Button>
                    <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 gap-2">
                        <Plus className="w-4 h-4" />
                        Add Device
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Device Cards */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <span className="text-sm">Loading devices...</span>
                    </div>
                </div>
            ) : devices.length === 0 ? (
                <Card className="bg-card border-border">
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center">
                            <Server className="w-8 h-8 text-muted-foreground/40" />
                        </div>
                        <div className="text-center">
                            <p className="text-base font-semibold text-foreground">No devices configured</p>
                            <p className="text-sm text-muted-foreground mt-1">Add your first ZKTeco biometric device to get started</p>
                        </div>
                        <Button onClick={openAdd} className="bg-primary gap-2">
                            <Plus className="w-4 h-4" />
                            Add Device
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {devices.map(device => {
                        const testResult = testResults[device.id]
                        const isTesting = testingId === device.id
                        const isConfirmingDelete = deleteConfirmId === device.id
                        const isToggling = togglingId === device.id

                        return (
                            <Card key={device.id} className="bg-card border-border overflow-hidden">
                                {/* Card Header */}
                                <div className="flex items-start justify-between p-5 pb-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${device.isActive ? 'bg-green-500/15' : 'bg-secondary/50'
                                            }`}>
                                            {device.isActive
                                                ? <Wifi className="w-5 h-5 text-green-500" />
                                                : <WifiOff className="w-5 h-5 text-muted-foreground" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-foreground truncate">{device.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] ${device.isActive
                                                        ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                                        : 'bg-secondary/50 text-muted-foreground border-border'
                                                        }`}
                                                >
                                                    {device.isActive ? '● Online' : '○ Offline'}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] ${device.syncEnabled
                                                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                        : 'bg-secondary/50 text-muted-foreground border-border'
                                                        }`}
                                                >
                                                    {device.syncEnabled ? '⟳ Sync On' : '⏸ Sync Off'}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Sync On/Off Toggle */}
                                    <button
                                        onClick={() => handleToggleSync(device)}
                                        disabled={isToggling}
                                        title={device.syncEnabled ? 'Disable sync for this device' : 'Enable sync for this device'}
                                        className={`relative flex items-center shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                                            device.syncEnabled
                                                ? 'bg-primary'
                                                : 'bg-secondary border border-border'
                                        } ${isToggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                        <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ${
                                            device.syncEnabled ? 'translate-x-6' : 'translate-x-1'
                                        }`} />
                                    </button>
                                </div>

                                {/* Device Info */}
                                <div className="px-5 pb-4 space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Server className="w-3.5 h-3.5 shrink-0" />
                                        <span className="font-mono font-medium text-foreground">
                                            {device.ip}:{device.port}
                                        </span>
                                    </div>
                                    {device.location && (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                                            <span>{device.location}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Test Result */}
                                {testResult && (
                                    <div className={`mx-5 mb-4 px-3 py-2.5 rounded-xl text-xs font-medium border ${testResult.success
                                        ? 'bg-green-500/10 border-green-500/20 text-green-600'
                                        : isTesting
                                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-600'
                                            : 'bg-red-500/10 border-red-500/20 text-red-600'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            {testResult.success
                                                ? <Check className="w-3.5 h-3.5 shrink-0" />
                                                : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                                            <span>{testResult.message}</span>
                                        </div>
                                        {testResult.success && testResult.info && (
                                            <div className="mt-1.5 pl-5 text-[10px] space-y-0.5 text-muted-foreground">
                                                <p>Enrolled users: <span className="font-bold text-foreground">{testResult.info.userCount}</span></p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="px-5 pb-5 flex flex-col gap-2">
                                    {/* Test Connection */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleTest(device)}
                                        disabled={isTesting || isToggling}
                                        className="w-full gap-2 border-border text-sm"
                                    >
                                        {isTesting
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</>
                                            : <><Activity className="w-4 h-4" /> Test Connection</>}
                                    </Button>

                                    <div className="flex gap-2">
                                        {/* Edit */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openEdit(device)}
                                            className="flex-1 gap-1.5 border-border text-sm"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Configure
                                        </Button>

                                        {/* Delete */}
                                        {isConfirmingDelete ? (
                                            <div className="flex gap-1.5">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleDelete(device.id)}
                                                    disabled={deletingId === device.id}
                                                    className="bg-red-600 hover:bg-red-700 text-white text-xs px-3"
                                                >
                                                    {deletingId === device.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setDeleteConfirmId(null)} className="text-xs px-3 border-border"
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setDeleteConfirmId(device.id)}
                                                className="border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 text-sm px-3"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Add / Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-secondary/20">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <RadioTower className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">{editingDevice ? 'Configure Device' : 'Add New Device'}</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">ZKTeco biometric device settings</p>
                                </div>
                            </div>
                            <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                                <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-4">
                            {formError && (
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {formError}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Device Name *</label>
                                <Input
                                    placeholder="e.g. Main Entrance Scanner"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    className="bg-secondary/40 border-border"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2 space-y-1.5">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">IP Address *</label>
                                    <Input
                                        placeholder="192.168.1.201"
                                        value={form.ip}
                                        onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                                        className="bg-secondary/40 border-border font-mono"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Port</label>
                                    <Input
                                        placeholder="4370"
                                        value={form.port}
                                        onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                                        className="bg-secondary/40 border-border font-mono"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Location / Description</label>
                                <Input
                                    placeholder="e.g. Main Lobby, Ground Floor"
                                    value={form.location}
                                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                                    className="bg-secondary/40 border-border"
                                />
                            </div>

                            <div className="bg-secondary/30 border border-border rounded-xl p-3 text-xs text-muted-foreground flex items-start gap-2">
                                <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                                <span>After saving, use <strong className="text-foreground">Test Connection</strong> to verify the device is reachable and confirm configuration.</span>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 pb-6 flex gap-3">
                            <Button variant="outline" onClick={closeModal} className="flex-1 border-border">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 bg-primary hover:bg-primary/90 gap-2"
                            >
                                {saving
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                                    : <><Check className="w-4 h-4" /> {editingDevice ? 'Save Changes' : 'Add Device'}</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}



            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.ok ? 'bg-slate-800 text-white' : 'bg-red-600 text-white'
                    }`}>
                    {toast.ok ? <Check className="w-4 h-4 text-green-400" /> : <AlertCircle className="w-4 h-4" />}
                    {toast.msg}
                </div>
            )}
        </div>
    )
}