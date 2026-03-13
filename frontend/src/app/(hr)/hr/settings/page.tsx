"use client";

import React, { useState, useEffect } from 'react';
import { Shield, Lock, Eye, EyeOff, Save, CheckCircle, Mail, MapPin, Calendar, X, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

export default function SettingsPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const [userData, setUserData] = useState({
    name: "mwehehe",
    role: "HR Payroll Officer",
    email: "admin@bipbip.com",
    site: "Cebu Office",
    joined: "January 2024"
  });

  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    confirm: ""
  });

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  useEffect(() => {
    const savedData = localStorage.getItem('userData');
    if (savedData) {
      setUserData(JSON.parse(savedData));
    }
  }, []);

  const handleSaveAll = () => {
    localStorage.setItem('userData', JSON.stringify(userData));
    setIsEditingProfile(false);
    setToastMessage("Account updated successfully!");
    setShowToast(true);
    window.dispatchEvent(new Event('profileUpdate'));
  };

  const handlePasswordChange = () => {
    if (!passwordForm.current || !passwordForm.new || !passwordForm.confirm) {
      setToastMessage("Please fill in all password fields.");
      setShowToast(true);
      return;
    }

    if (passwordForm.new !== passwordForm.confirm) {
      setToastMessage("New passwords do not match!");
      setShowToast(true);
      return;
    }

    setIsUpdatingPassword(true);

    setTimeout(() => {
      setIsUpdatingPassword(false);
      setToastMessage("Password changed successfully!");
      setShowToast(true);
      setPasswordForm({ current: "", new: "", confirm: "" });
    }, 1500);
  };

  const confirmCancel = () => {
    setIsEditingProfile(false);
    setShowCancelModal(false);
    const savedData = localStorage.getItem('userData');
    if (savedData) {
      setUserData(JSON.parse(savedData));
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">
          Account Settings
        </h2>
        <button
          onClick={handleSaveAll}
          className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95"
        >
          <Save size={18} /> Save All Changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

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
                      Cancel Changes
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Full Name</label>
                    <input
                      disabled={!isEditingProfile}
                      value={userData.name}
                      onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                      className="w-full p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/10 disabled:opacity-60"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                      <input
                        disabled={!isEditingProfile}
                        value={userData.email}
                        onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                        className="w-full pl-10 p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Office Location</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                      <input
                        disabled={!isEditingProfile}
                        value={userData.site}
                        onChange={(e) => setUserData({ ...userData, site: e.target.value })}
                        className="w-full pl-10 p-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="space-y-1 flex flex-col justify-center">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">
                      Joined Date
                    </label>
                    <div className="flex items-center gap-2 px-1">
                      <Calendar className="text-red-400" size={16} />
                      <span className="text-sm font-bold text-slate-600">
                        {userData.joined}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

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

        <div className="space-y-6">
          <div className="bg-slate-900 p-8 text-white rounded-3xl shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Shield size={16} className="text-red-500" /> Account Status
            </h3>
            <div className="space-y-4">
              <div className="pb-4 border-b border-white/10">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Account Role</p>
                <p className="text-sm font-black text-red-500 uppercase tracking-tighter">
                  {userData.role}
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Permissions</p>
                {['Full Access', 'Attendance Correction', 'Report Generation', 'User Management'].map((perm) => (
                  <div key={perm} className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {perm}
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-white/10">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Last Login</p>
                <p className="text-sm font-medium">Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

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
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-smfont-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-50">
          <span className="text-sm font-bold tracking-tight">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}