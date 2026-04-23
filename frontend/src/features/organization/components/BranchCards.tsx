import { MapPin, Edit2, Trash2, Loader2 } from 'lucide-react'
import type { Branch } from '../types'

interface BranchCardsProps {
  branches: Branch[]
  branchCounts: Record<string, number>
  loading: boolean
  onEditBranch: (branch: Branch) => void
  onDeleteBranch: (branch: Branch) => void
}

export function BranchCards({
  branches, branchCounts, loading,
  onEditBranch, onDeleteBranch,
}: BranchCardsProps) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Branches</h3>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading branches...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {branches.map(branch => {
            const count = branchCounts[branch.name] || 0
            return (
              <div key={branch.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-all group">
                <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-lg shadow-blue-500/20">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-700 text-sm">{branch.name}</p>
                  <p className="text-xs text-slate-400">{count} {count === 1 ? 'employee' : 'employees'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {count > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[10px] font-bold text-emerald-500">Active</span>
                    </div>
                  )}
                  <button
                    onClick={() => onEditBranch(branch)}
                    title="Edit branch"
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {count === 0 ? (
                    <button
                      onClick={() => onDeleteBranch(branch)}
                      title="Remove branch"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span
                      title={`Cannot delete — ${count} active employee${count > 1 ? 's' : ''} assigned`}
                      className="opacity-0 group-hover:opacity-40 p-1.5 rounded-lg text-slate-300 cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {branches.length === 0 && (
            <p className="text-sm text-slate-400 italic py-2">No branches found.</p>
          )}
        </div>
      )}
    </div>
  )
}
