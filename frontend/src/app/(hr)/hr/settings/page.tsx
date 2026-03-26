"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Eye, EyeOff, Save, CheckCircle, Mail, MapPin, Calendar, X, AlertTriangle, Phone } from 'lucide-react';
import Image from 'next/image';

export default function SettingsPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("success");

  // User data from API
  const [userData, setUserData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "",
    contactNumber: "",
    branch: "",
    department: "",
    position: "",
  });

  // Backup for cancel
  const [originalData, setOriginalData] = useState(userData);

  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    confirm: ""
  });

  const showToastMsg = (msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
  };

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  // Fetch real user data from API
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          router.replace('/login');
          return;
        }
        const data = await res.json();
        const emp = data.employee ?? data;
        const user = {
          firstName: emp.firstName || "",
          lastName: emp.lastName || "",
          email: emp.email || "",
          role: emp.role || "",
          contactNumber: emp.contactNumber || emp.phone || "",
          branch: emp.branch || "",
          department: emp.department || "",
          position: emp.position || "",
        };
        setUserData(user);
        setOriginalData(user);
      } catch {
        router.replace('/login');
      }
    };
    fetchUser();
  }, [router]);

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: userData.firstName,
          lastName: userData.lastName,
          contactNumber: userData.contactNumber,
        })
      });

      if (res.status === 401) {
        router.replace('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setOriginalData(userData);
        setIsEditingProfile(false);
        showToastMsg("Profile updated successfully!");
        window.dispatchEvent(new Event('profileUpdate'));
      } else {
        showToastMsg(data.message || "Failed to update profile.", "error");
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      showToastMsg("Failed to update profile.", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.current || !passwordForm.new || !passwordForm.confirm) {
      showToastMsg("Please fill in all password fields.", "error");
      return;
    }

    if (passwordForm.new.length < 8) {
      showToastMsg("New password must be at least 8 characters.", "error");
      return;
    }

    if (passwordForm.new !== passwordForm.confirm) {
      showToastMsg("New passwords do not match!", "error");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const res = await fetch('/api/users/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.new,
        })
      });

      const data = await res.json();
      if (data.success) {
        showToastMsg("Password changed successfully!");
        setPasswordForm({ current: "", new: "", confirm: "" });
      } else {
        showToastMsg(data.message || "Failed to change password.", "error");
      }
    } catch (error) {
      console.error('Error changing password:', error);
      showToastMsg("Failed to change password.", "error");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const confirmCancel = () => {
    setUserData(originalData);
    setIsEditingProfile(false);
    setShowCancelModal(false);
  };

  // Password strength
  const getPasswordStrength = (pw: string) => {
    if (!pw) return { label: '', color: '', width: '0%' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '25%' };
    if (score === 2) return { label: 'Fair', color: 'bg-yellow-500', width: '50%' };
    if (score === 3) return { label: 'Good', color: 'bg-blue-500', width: '75%' };
    return { label: 'Strong', color: 'bg-green-500', width: '100%' };
  };

  const strength = getPasswordStrength(passwordForm.new);

  const displayName = `${userData.firstName} ${userData.lastName}`.trim() || 'User';

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">
          Account Settings
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Profile Card */}
          <div className="bg-white border border-slate-200 overflow-hidden shadow-sm rounded-3xl">
            <div className="h-32 bg-[#E60000]" />
            <div className="px-8 pb-8">
              <div className="relative flex justify-between items-end -mt-12 mb-6">
                <div className="h-24 w-24 rounded-3xl bg-[#FE0908] p-1 shadow-xl border border-slate-100 overflow-hidden">
                  <div className="h-full w-full rounded-2xl overflow-hidden relative">
                    <Image
                      src="/images/av.jpg"
                      alt="Avatar"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                </div>
                {!isEditingProfile ? (
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="px-6 py-2 border border-slate-400 text-slate-600 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 transition-all"
                  >
                    Edit Personal Info
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="px-6 py-2 border border-slate-400 text-slate-600 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={isSavingProfile}
                      className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95 disabled:opacity-50"
                    >
                      <Save size={14} /> {isSavingProfile ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">First Name</label>
                    <input
                      disabled={!isEditingProfile}
                      value={userData.firstName}
                      onChange={(e) => setUserData({ ...userData, firstName: e.target.value })}
                      className="w-full p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/10 disabled:opacity-60"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Last Name</label>
                    <input
                      disabled={!isEditingProfile}
                      value={userData.lastName}
                      onChange={(e) => setUserData({ ...userData, lastName: e.target.value })}
                      className="w-full p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/10 disabled:opacity-60"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                      <input
                        disabled
                        value={userData.email}
                        className="w-full pl-10 p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none disabled:opacity-60"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 ml-1">Email cannot be changed</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Contact Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                      <input
                        disabled={!isEditingProfile}
                        value={userData.contactNumber}
                        onChange={(e) => setUserData({ ...userData, contactNumber: e.target.value })}
                        placeholder="+63-000-000-0000"
                        className="w-full pl-10 p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-60 placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Branch</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                      <input
                        disabled
                        value={userData.branch || 'Not assigned'}
                        className="w-full pl-10 p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Department</label>
                    <input
                      disabled
                      value={userData.department || 'Not assigned'}
                      className="w-full p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Password Card */}
          <div className="bg-white border border-slate-200 p-8 shadow-sm rounded-3xl">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Lock size={16} className="text-red-500" /> Security & Password
            </h3>

            <div className="space-y-5 max-w-md">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Current Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                  placeholder="••••••••"
                  className="w-full p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordForm.new}
                      onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                      placeholder="New password"
                      className="w-full p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                    />
                  </div>
                  {/* Strength meter */}
                  {passwordForm.new && (
                    <div className="mt-1">
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
                      </div>
                      <p className={`text-[10px] mt-1 font-bold ${strength.label === 'Weak' ? 'text-red-500' : strength.label === 'Fair' ? 'text-yellow-500' : strength.label === 'Good' ? 'text-blue-500' : 'text-green-500'}`}>
                        Password strength: {strength.label}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                      placeholder="Confirm password"
                      className="w-full p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handlePasswordChange}
                disabled={isUpdatingPassword}
                className="w-full md:w-fit px-8 py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-800 transition-all active:scale-95 disabled:opacity-50"
              >
                {isUpdatingPassword ? "Saving..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-8 text-white rounded-3xl shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Shield size={16} className="text-red-500" /> Account Status
            </h3>
            <div className="space-y-4">
              <div className="pb-4 border-b border-white/10">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Signed In As</p>
                <p className="text-sm font-black text-white mt-1">{displayName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{userData.email}</p>
              </div>
              <div className="pb-4 border-b border-white/10">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Account Role</p>
                <p className="text-sm font-black text-red-500 uppercase tracking-tighter">
                  {userData.role === 'HR' ? 'HR Personnel' : userData.role || 'HR'}
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Permissions</p>
                {['Attendance Monitoring', 'Attendance Correction', 'Report Generation', 'Employee Management'].map((perm) => (
                  <div key={perm} className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {perm}
                  </div>
                ))}
              </div>
              {userData.branch && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Branch</p>
                  <p className="text-sm font-medium">{userData.branch}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center space-y-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Discard changes?</h3>
                <p className="text-sm font-medium text-slate-500 mt-1">Your unsaved modifications will be lost.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCancel}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95"
                >
                  Yes, Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {showToast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 ${toastType === 'error' ? 'bg-red-600' : 'bg-emerald-600'} text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-50`}>
          {toastType === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <span className="text-sm font-bold tracking-tight">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}