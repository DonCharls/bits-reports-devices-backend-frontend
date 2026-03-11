'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  Plus,
  Edit2,
  UserCog,
  Shield,
  ChevronLeft,
  ChevronRight,
  Mail,
  Eye,
  EyeOff,
  Users,
  X as XIcon
} from 'lucide-react'

interface UserAccount {
  id: number
  firstName: string
  lastName: string
  email: string
  role: string
  status: 'active' | 'inactive'
  createdAt: string
}

// Password strength helper
const getPasswordStrength = (pw: string) => {
  if (!pw) return { label: '', color: '', width: '0%' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Weak', color: 'bg-red-500', textColor: 'text-red-500', width: '25%' }
  if (score === 2) return { label: 'Fair', color: 'bg-yellow-500', textColor: 'text-yellow-500', width: '50%' }
  if (score === 3) return { label: 'Good', color: 'bg-blue-500', textColor: 'text-blue-500', width: '75%' }
  return { label: 'Strong', color: 'bg-green-500', textColor: 'text-green-500', width: '100%' }
}

export default function UserAccountsPage() {
  const [users, setUsers] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10

  // Add / Edit dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'ADMIN' as string,
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')

  // Fetch users from backend
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')

      if (res.status === 401) {
        window.location.href = '/login'
        return
      }

      const data = await res.json()
      if (data.success) {
        setUsers(data.users)
      } else {
        console.error('Failed to fetch users:', data.message)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const filteredUsers = users.filter(u => {
    const matchesSearch = `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role.toLowerCase() === roleFilter
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter
    return matchesSearch && matchesRole && matchesStatus
  })

  const totalPages = Math.ceil(filteredUsers.length / rowsPerPage) || 1
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  )

  // Stats
  const totalUsers = users.length
  const adminCount = users.filter(u => u.role === 'ADMIN').length
  const hrCount = users.filter(u => u.role === 'HR').length

  const openAddDialog = () => {
    setEditingUser(null)
    setFormData({ firstName: '', lastName: '', email: '', role: 'ADMIN', password: '', confirmPassword: '' })
    setFormError('')
    setIsDialogOpen(true)
  }

  const openEditDialog = (user: UserAccount) => {
    setEditingUser(user)
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      password: '',
      confirmPassword: '',
    })
    setFormError('')
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    setFormError('')
    if (!formData.firstName || !formData.lastName || !formData.email) {
      setFormError('First name, last name, and email are required')
      return
    }
    if (!editingUser && (!formData.password || formData.password.length < 8)) {
      setFormError('Password must be at least 8 characters')
      return
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match')
      return
    }

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users'
      const method = editingUser ? 'PUT' : 'POST'

      const body: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        role: formData.role,
      }
      if (formData.password) {
        body.password = formData.password
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (data.success) {
        await fetchUsers()
        setIsDialogOpen(false)
      } else {
        setFormError(data.message || 'Failed to save user')
      }
    } catch (error) {
      console.error('Error saving user:', error)
      setFormError('Failed to save user')
    }
  }

  const toggleStatus = async (id: number) => {
    try {
      const res = await fetch(`/api/users/${id}/toggle-status`, {
        method: 'PATCH',
      })
      const data = await res.json()
      if (data.success) {
        await fetchUsers()
      } else {
        alert(data.message || 'Failed to toggle status')
      }
    } catch (error) {
      console.error('Error toggling status:', error)
    }
  }

  const strength = getPasswordStrength(formData.password)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center">
            <UserCog className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">User Accounts</h2>
            <p className="text-muted-foreground text-sm mt-0.5">Manage admin and HR user accounts</p>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog} className="bg-red-600 hover:bg-red-700 gap-2 text-white shadow-lg shadow-red-600/20 w-full sm:w-auto">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent showCloseButton={false} className="bg-white border-0 max-w-md mx-4 p-0 rounded-2xl overflow-hidden shadow-xl">
            <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
              <div>
                <DialogTitle className="text-white font-bold text-lg">{editingUser ? 'Edit User Account' : 'Add New User'}</DialogTitle>
                <DialogDescription className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">{editingUser ? 'Update user details' : 'Create a new user account'}</DialogDescription>
              </div>
              <button onClick={() => setIsDialogOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">First Name</label>
                  <input
                    placeholder="First name"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Last Name</label>
                  <input
                    placeholder="Last name"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Email</label>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input
                    type="email"
                    placeholder="user@avega.com"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Role</label>
                <select
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="ADMIN">Administrator</option>
                  <option value="HR">HR</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">{editingUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={editingUser ? 'Leave blank to keep current' : 'Min. 8 characters'}
                    className="w-full px-3 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Password Strength Meter */}
                {formData.password && (
                  <div className="mt-2">
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
                    </div>
                    <p className={`text-[10px] mt-1 font-bold ${strength.textColor}`}>
                      Password strength: {strength.label}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                />
              </div>

              {formError && (
                <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl p-3 font-medium">{formError}</p>
              )}
            </div>
            <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
              <button
                className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => setIsDialogOpen(false)}
              >
                Discard
              </button>
              <button onClick={handleSave} className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors">
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stat Cards — 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400 font-medium">Total Users</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{totalUsers}</p>
              <p className="text-xs text-slate-400 mt-1">Registered accounts</p>
            </div>
            <div className="p-2.5 rounded-lg bg-red-50">
              <Users className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </Card>
        <Card className="bg-white border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400 font-medium">Administrators</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{adminCount}</p>
              <p className="text-xs text-slate-400 mt-1">Admin role accounts</p>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>
        <Card className="bg-white border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400 font-medium">HR Users</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{hrCount}</p>
              <p className="text-xs text-slate-400 mt-1">HR role accounts</p>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50">
              <UserCog className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="bg-white border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search by name or email..."
              className="pl-10 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
            />
          </div>
          <Select value={roleFilter} onValueChange={(v: string) => { setRoleFilter(v); setCurrentPage(1) }}>
            <SelectTrigger className="w-full sm:w-40 bg-slate-50 border-slate-200 text-slate-700">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="hr">HR</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v); setCurrentPage(1) }}>
            <SelectTrigger className="w-full sm:w-40 bg-slate-50 border-slate-200 text-slate-700">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4 hidden md:table-cell">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 hidden sm:table-cell">Status</th>
                <th className="px-6 py-4 hidden lg:table-cell">Created</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold text-xs">Loading users...</td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">No users found</td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-red-50/50 transition-colors duration-200 group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${user.role === 'ADMIN' ? 'bg-blue-500' : 'bg-emerald-500'}`}>
                          {user.firstName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-700 truncate">{user.firstName} {user.lastName}</p>
                          <p className="text-xs text-slate-400 md:hidden truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="text-xs font-medium text-slate-500">{user.email}</span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className={user.role === 'ADMIN'
                          ? 'bg-blue-50 text-blue-600 border-blue-200 text-xs'
                          : 'bg-emerald-50 text-emerald-600 border-emerald-200 text-xs'
                        }
                      >
                        {user.role === 'ADMIN' ? 'Admin' : 'HR'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <button onClick={() => toggleStatus(user.id)}>
                        <Badge
                          variant="outline"
                          className={`cursor-pointer ${user.status === 'active'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 text-xs'
                            : 'bg-red-50 text-red-600 border-red-200 text-xs'
                            }`}
                        >
                          {user.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <span className="text-xs font-medium text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString('en-CA')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openEditDialog(user)}
                        className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-bold">
            Showing {filteredUsers.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0} to {Math.min(currentPage * rowsPerPage, filteredUsers.length)} of {filteredUsers.length} users
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => p - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${
                  currentPage === page
                    ? 'bg-red-600 text-white'
                    : 'text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
