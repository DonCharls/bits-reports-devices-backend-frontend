'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  User,
  Lock,
  Mail,
  Phone,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'

export default function SettingsPage() {
  const [userName, setUserName] = useState('Admin')
  const [userEmail, setUserEmail] = useState('admin@avega.com')
  const [userRole, setUserRole] = useState('ADMIN')

  // Profile form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState('')

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)

  useEffect(() => {
    try {
      const employee = localStorage.getItem('employee')
      if (employee) {
        const parsed = JSON.parse(employee)
        setFirstName(parsed.firstName || '')
        setLastName(parsed.lastName || '')
        setUserName(`${parsed.firstName || ''} ${parsed.lastName || ''}`.trim() || 'Admin')
        setUserEmail(parsed.email || 'admin@avega.com')
        setUserRole(parsed.role || 'ADMIN')
        setPhone(parsed.contactNumber || parsed.phone || '')
      }
    } catch {
      // fallback defaults
    }
  }, [])

  const handleSaveProfile = async () => {
    setProfileError('')
    setProfileSaved(false)
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, contactNumber: phone })
      })

      if (res.status === 401) {
        window.location.href = '/login'
        return
      }

      const data = await res.json()
      if (data.success) {
        const employee = localStorage.getItem('employee')
        if (employee) {
          const parsed = JSON.parse(employee)
          parsed.firstName = firstName
          parsed.lastName = lastName
          parsed.contactNumber = phone
          localStorage.setItem('employee', JSON.stringify(parsed))
        }
        setUserName(`${firstName} ${lastName}`.trim() || 'Admin')
        setProfileSaved(true)
        setTimeout(() => setProfileSaved(false), 3000)
      } else {
        setProfileError(data.message || 'Failed to update profile')
      }
    } catch (error) {
      console.error('Error saving profile:', error)
      setProfileError('Failed to update profile')
    }
  }

  const handleChangePassword = async () => {
     setPasswordError('')
    setPasswordSaved(false)

    if (!currentPassword) {
      setPasswordError('Current password is required')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    try {
      const res = await fetch('/api/users/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      })

      if (res.status === 401 && !currentPassword) {
        window.location.href = '/login'
        return
      }

      const data = await res.json()
      if (data.success) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPasswordSaved(true)
        setTimeout(() => setPasswordSaved(false), 3000)
      } else {
        setPasswordError(data.message || 'Failed to change password')
      }
    } catch (error) {
      console.error('Error changing password:', error)
      setPasswordError('Failed to change password')
    }
  }

  // Password strength indicator
  const getPasswordStrength = (pw: string) => {
    if (!pw) return { label: '', color: '', width: '0%' }
    let score = 0
    if (pw.length >= 8) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '25%' }
    if (score === 2) return { label: 'Fair', color: 'bg-yellow-500', width: '50%' }
    if (score === 3) return { label: 'Good', color: 'bg-blue-500', width: '75%' }
    return { label: 'Strong', color: 'bg-green-500', width: '100%' }
  }

  const strength = getPasswordStrength(newPassword)

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center">
          <User className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Account Settings</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Manage your profile and security preferences</p>
        </div>
      </div>

      {/* ─── Profile Card ──────────────────────────────────── */}
      <Card className="bg-white border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-50 p-2 rounded-lg">
            <User className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Profile Information</h3>
            <p className="text-xs text-slate-400">Update your personal details</p>
          </div>
        </div>

        {/* Avatar — clean, no camera button */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-lg sm:text-xl border-2 border-red-500/30 shadow-lg shadow-red-600/20">
            {firstName ? firstName.charAt(0).toUpperCase() : 'A'}
          </div>
          <div className="text-center sm:text-left">
            <p className="text-sm font-bold text-slate-800">{userName}</p>
            <p className="text-xs text-slate-400">{userEmail}</p>
            <Badge variant="outline" className="mt-1 bg-red-50 text-red-600 border-red-200 text-[10px]">
              <Shield className="w-3 h-3 mr-1" />{userRole === 'ADMIN' ? 'Administrator' : 'HR'}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-600 text-sm font-medium">First Name</Label>
            <Input
              placeholder="First name"
              className="mt-1.5 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
              value={firstName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-slate-600 text-sm font-medium">Last Name</Label>
            <Input
              placeholder="Last name"
              className="mt-1.5 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
              value={lastName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-slate-600 text-sm font-medium">Email</Label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <Input
                type="email"
                className="pl-10 bg-slate-50 border-slate-200 text-slate-700 opacity-60"
                value={userEmail}
                readOnly
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed</p>
          </div>
          <div>
            <Label className="text-slate-600 text-sm font-medium">Phone</Label>
            <div className="relative mt-1.5">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <Input
                type="tel"
                placeholder="+63-000-000-0000"
                className="pl-10 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
              />
            </div>
          </div>
        </div>

        {profileError && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {profileError}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
          {profileSaved && (
            <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
          <Button onClick={handleSaveProfile} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
            Save Changes
          </Button>
        </div>
      </Card>

      {/* ─── Change Password Card ──────────────────────────── */}
      <Card className="bg-white border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-50 p-2 rounded-lg">
            <Lock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Change Password</h3>
            <p className="text-xs text-slate-400">Update your password to keep your account secure</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Current Password */}
          <div>
            <Label className="text-slate-600 text-sm font-medium">Current Password</Label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <Input
                type={showCurrent ? 'text' : 'password'}
                placeholder="Enter current password"
                className="pl-10 pr-10 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
                value={currentPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <Label className="text-slate-600 text-sm font-medium">New Password</Label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <Input
                type={showNew ? 'text' : 'password'}
                placeholder="Enter new password"
                className="pl-10 pr-10 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
                value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNewPassword(e.target.value); setPasswordError('') }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Strength meter */}
            {newPassword && (
              <div className="mt-2">
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
                </div>
                <p className={`text-[10px] mt-1 font-bold ${strength.label === 'Weak' ? 'text-red-500' :
                    strength.label === 'Fair' ? 'text-yellow-500' :
                      strength.label === 'Good' ? 'text-blue-500' : 'text-green-500'
                  }`}>
                  Password strength: {strength.label}
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <Label className="text-slate-600 text-sm font-medium">Confirm New Password</Label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <Input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm new password"
                className="pl-10 pr-10 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setConfirmPassword(e.target.value); setPasswordError('') }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error / Success */}
          {passwordError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {passwordError}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
          {passwordSaved && (
            <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> Password updated
            </span>
          )}
          <Button onClick={handleChangePassword} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
            Update Password
          </Button>
        </div>
      </Card>
    </div>
  )
}
