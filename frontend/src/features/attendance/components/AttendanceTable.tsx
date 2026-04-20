import React from 'react'
import { DataTablePagination } from '@/components/ui/DataTablePagination'
import { AttendanceMobileCards } from './AttendanceMobileCards'
import { AttendanceDesktopTable } from './AttendanceDesktopTable'
import { AttendanceRecord } from '../types'

interface AttendanceTableProps {
  loading: boolean
  records: AttendanceRecord[]
  sortedRecords: AttendanceRecord[]
  sortKeyStr: string | null
  sortOrder: 'asc' | 'desc' | null
  handleSort: (key: keyof AttendanceRecord) => void
  currentPage: number
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>
  totalPages: number
  rowsPerPage: number
  handleEditClick: (row: AttendanceRecord) => void
  dragScrollRef?: React.RefObject<HTMLDivElement | null>
}

export function AttendanceTable({
  loading,
  records,
  sortedRecords,
  sortKeyStr,
  sortOrder,
  handleSort,
  currentPage,
  setCurrentPage,
  totalPages,
  rowsPerPage,
  handleEditClick,
  dragScrollRef,
}: AttendanceTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Mobile Card View */}
      <div className="lg:hidden">
        <AttendanceMobileCards
          loading={loading}
          records={records}
          sortedRecords={sortedRecords}
          currentPage={currentPage}
          rowsPerPage={rowsPerPage}
          handleEditClick={handleEditClick}
        />
      </div>

      {/* Desktop Table View */}
      <div ref={dragScrollRef} className="overflow-x-auto scrollbar-slim cursor-grab active:cursor-grabbing hidden lg:block">
        <AttendanceDesktopTable
          loading={loading}
          sortedRecords={sortedRecords}
          sortKeyStr={sortKeyStr}
          sortOrder={sortOrder}
          handleSort={handleSort}
          currentPage={currentPage}
          rowsPerPage={rowsPerPage}
          handleEditClick={handleEditClick}
        />
      </div>

      {/* Pagination */}
      <DataTablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalCount={records.length}
        pageSize={rowsPerPage}
        entityName="attendance records"
        loading={loading}
      />
    </div>
  )
}
