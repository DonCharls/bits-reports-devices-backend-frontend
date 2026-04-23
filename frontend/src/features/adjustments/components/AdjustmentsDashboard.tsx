'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileCheck, History } from 'lucide-react';
import { AdjustmentListPage } from './AdjustmentListPage';
import { AdjustmentAuditLogsDashboard } from './AdjustmentAuditLogsDashboard';

interface AdjustmentsDashboardProps {
  role: 'admin' | 'hr';
}

export function AdjustmentsDashboard({ role }: AdjustmentsDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'history' ? 'history' : 'pending';
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>(initialTab);

  // Sync state to URL when tab changes manually
  const handleTabChange = (tab: 'pending' | 'history') => {
    setActiveTab(tab);
    // Remove entityId if switching tabs to avoid stale filters
    router.push(`?tab=${tab}`, { scroll: false });
  };

  // Sync state from URL when URL changes (e.g., from "View Audit Detail" link)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'history') {
      setActiveTab('history');
    } else {
      setActiveTab('pending');
    }
  }, [searchParams]);

  return (
    <div className="space-y-6 max-w-full">
      {/* Header and Tab Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
            Adjustments
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-0.5">
            Manage attendance adjustments and track modification history.
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => handleTabChange('pending')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
              activeTab === 'pending'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <FileCheck size={16} />
            Pending Review
          </button>
          <button
            onClick={() => handleTabChange('history')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
              activeTab === 'history'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <History size={16} />
            History / Audit Trail
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'pending' && <AdjustmentListPage role={role} />}
        {activeTab === 'history' && <AdjustmentAuditLogsDashboard />}
      </div>
    </div>
  );
}
