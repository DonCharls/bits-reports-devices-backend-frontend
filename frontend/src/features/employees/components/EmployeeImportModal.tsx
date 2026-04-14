import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Upload, X as XIcon, FileSpreadsheet, AlertCircle, Download, Loader2, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import * as XLSX from 'xlsx';

const MAX_IMPORT_ROWS = 200;

interface EmployeeImportModalProps {
  departments: { id: number; name: string }[];
  branches: { id: number; name: string }[];
  shifts: any[];
  onImportComplete: () => void;
}

export function EmployeeImportModal({ departments, branches, shifts, onImportComplete }: EmployeeImportModalProps) {
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'results'>('select');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [importParsedRows, setImportParsedRows] = useState<any[]>([]);
  const [importResults, setImportResults] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const resetState = useCallback(() => {
    setImportFile(null);
    setImportStep('select');
    setImportParsedRows([]);
    setImportResults([]);
    setImportFileError(null);
    setIsImporting(false);
  }, []);

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      const res = await fetch('/api/employees/export-template');
      if (!res.ok) throw new Error('Template download failed');
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'employee_import_template.xlsx'; document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href);
    } catch {
      showToast('error', 'Download Failed', 'Could not download template');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const parseAndValidateFile = async (file: File) => {
    setImportFileError(null);
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) { setImportFileError('No worksheet found.'); return; }
      
      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', range: 1 });
      const dataRows = jsonRows.filter(r => {
        const v = String(r?.employeeNumber ?? r?.['Employee Number'] ?? '').trim().toLowerCase();
        return !v.startsWith('e.g') && !v.startsWith('color') && !v.startsWith('unique') && v !== 'required field' && v !== 'optional field';
      });

      if (dataRows.length === 0) { setImportFileError('No data rows.'); return; }
      if (dataRows.length > MAX_IMPORT_ROWS) { setImportFileError(`Max ${MAX_IMPORT_ROWS} rows.`); return; }

      const deptNames = departments.map(d => d.name);
      const branchNames = branches.map(b => b.name);
      const seenEmpNums = new Set<string>();
      const seenEmails = new Set<string>();
      
      const parsed = dataRows.map((raw, idx) => {
        const n: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) n[k.replace(/[\s_]+/g, '').toLowerCase()] = v instanceof Date ? v.toISOString() : String(v ?? '').trim();
        
        const errors: string[] = [];
        const empNum = n['employeenumber'] || n['employeeid'] || n['empid'] || '';
        const firstName = n['firstname'] || '';
        const lastName = n['lastname'] || '';
        const middleName = n['middlename'];
        const suffix = n['suffix'];
        const gender = n['gender'];
        const dateOfBirth = n['dateofbirth'] || n['dob'] || n['birthday'];
        const email = n['email'] || n['emailaddress'] || '';
        const contactNumber = (n['contactnumber'] || n['phonenumber'] || n['phone'] || n['contact'] || '').replace(/\s/g, '');
        const department = n['department'] || n['dept'] || '';
        const branch = n['branch'] || '';
        const hireDate = n['hiredate'] || n['datehired'];
        const shiftCode = n['shiftcode'] || n['shift'] || undefined;

        if (!empNum) errors.push('Missing emp#');
        if (!firstName) errors.push('Missing first name');
        if (!lastName) errors.push('Missing last name');
        if (!email) errors.push('Missing email');
        if (!contactNumber) errors.push('Missing contact');
        if (!department) errors.push('Missing department');
        if (!branch) errors.push('Missing branch');
        
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format');
        if (contactNumber && contactNumber.replace(/\D/g, '').length !== 11) errors.push('Contact must be 11 digits');
        if (dateOfBirth && isNaN(Date.parse(dateOfBirth))) errors.push('Invalid date of birth');
        if (hireDate && isNaN(Date.parse(hireDate))) errors.push('Invalid hire date');

        if (department && !deptNames.includes(department)) errors.push(`Invalid dept: ${department}`);
        if (branch && !branchNames.includes(branch)) errors.push(`Invalid branch: ${branch}`);
        
        let resolvedShiftId: number | null = null;
        if (shiftCode) {
          const ms = shifts.find(s => s.shiftCode === shiftCode);
          if (!ms) errors.push(`Invalid shift: ${shiftCode}`); else resolvedShiftId = ms.id;
        }

        if (empNum) {
          if (seenEmpNums.has(empNum)) errors.push('Duplicate employee number in file');
          else seenEmpNums.add(empNum);
        }
        if (email) {
          const lowerEmail = email.toLowerCase();
          if (seenEmails.has(lowerEmail)) errors.push('Duplicate email in file');
          else seenEmails.add(lowerEmail);
        }

        return {
          _rowNumber: idx + 2, employeeNumber: empNum, firstName, lastName,
          middleName, suffix, gender, dateOfBirth, email, contactNumber, department, branch,
          hireDate, shiftCode, shiftId: resolvedShiftId,
          status: errors.length === 0 ? 'valid' : 'invalid', reason: errors.length > 0 ? errors.join('; ') : undefined
        };
      });
      setImportParsedRows(parsed);
      setImportStep('preview');
    } catch {
      setImportFileError('Failed to parse file.');
    }
  };

  const handleBulkImport = async () => {
    const validRows = importParsedRows.filter(r => r.status === 'valid');
    if (validRows.length === 0) return;
    setIsImporting(true);
    try {
      const payload = validRows.map(r => ({
        _rowNumber: r._rowNumber,
        employeeNumber: r.employeeNumber,
        firstName: r.firstName,
        lastName: r.lastName,
        middleName: r.middleName || undefined,
        suffix: r.suffix || undefined,
        gender: r.gender || undefined,
        dateOfBirth: r.dateOfBirth || undefined,
        email: r.email,
        contactNumber: r.contactNumber || undefined,
        department: r.department,
        branch: r.branch,
        hireDate: r.hireDate || undefined,
        shiftId: r.shiftId || undefined,
      }));
      const res = await fetch('/api/employees/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: payload })
      });
      const data = await res.json();
      if (data.success && data.results) {
        setImportResults(data.results);
        setImportStep('results');
        onImportComplete();
      } else {
        showToast('error', 'Import Failed', data.message || 'Server error.');
      }
    } catch {
      showToast('error', 'Import Failed', 'Could not reach the server.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1 sm:flex-none border-border text-foreground hover:bg-red-700 hover:text-white gap-2 transition-all active:scale-95">
          <Upload className="w-4 h-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={`bg-white border-0 p-0 rounded-2xl overflow-hidden shadow-xl transition-all ${importStep === 'select' ? 'sm:max-w-md' : importStep === 'preview' ? 'sm:max-w-5xl' : 'sm:max-w-3xl'}`}>
        <div className="bg-red-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-white font-bold text-lg">Import Employees</DialogTitle>
            <DialogDescription className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">
              {importStep === 'select' ? 'Upload from Excel or CSV' : importStep === 'preview' ? 'Review before importing' : 'Import results'}
            </DialogDescription>
          </div>
          <button onClick={() => { setIsOpen(false); resetState(); }} className="text-white/80 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {importStep === 'select' && (
          <>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-500 font-medium">
                Upload an Excel file (.xlsx, .xls) or CSV (.csv) to bulk import employee records.
              </p>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-red-300 transition-colors">
                <Upload className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <label htmlFor="excel-upload" className="cursor-pointer">
                  <span className="text-sm text-red-500 font-bold hover:underline">Click to select file</span>
                  <input
                    id="excel-upload"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setImportFile(file)
                        parseAndValidateFile(file)
                      }
                    }}
                  />
                </label>
                <p className="text-xs text-slate-400 mt-1">Supports .xlsx, .xls, .csv · Max {MAX_IMPORT_ROWS} rows</p>
              </div>
              {importFile && !importFileError && (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                  <FileSpreadsheet className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-slate-700 font-medium flex-1 truncate">{importFile.name}</span>
                  <span className="text-xs text-slate-400">{(importFile.size / 1024).toFixed(1)} KB</span>
                </div>
              )}
              {importFileError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-red-700 font-medium">{importFileError}</span>
                </div>
              )}
              {/* Download Template */}
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <span className="text-xs text-slate-500 font-medium">Not sure about the format?</span>
                <button
                  onClick={handleDownloadTemplate}
                  disabled={isDownloadingTemplate}
                  className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  {isDownloadingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Download template
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
              <button
                className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => { setIsOpen(false); resetState(); }}
              >
                Discard
              </button>
            </div>
          </>
        )}

        {importStep === 'preview' && (() => {
          const validCount = importParsedRows.filter(r => r.status === 'valid').length;
          const invalidCount = importParsedRows.filter(r => r.status === 'invalid').length;
          return (
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600 font-medium">
                <span className="text-green-600 font-bold">{validCount}</span> row{validCount !== 1 ? 's' : ''} ready{invalidCount > 0 && <>, <span className="text-red-500 font-bold">{invalidCount}</span> row{invalidCount !== 1 ? 's' : ''} {invalidCount !== 1 ? 'have' : 'has'} errors</>}.
              </p>
              <Button variant="ghost" size="sm" onClick={resetState}><RotateCcw className="w-4 h-4 mr-1"/> Change file</Button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto mb-4 border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Row</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Emp. No.</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">First Name</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Last Name</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Department</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Branch</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importParsedRows.map((row, idx) => (
                    <tr key={idx} className={row.status === 'invalid' ? 'bg-red-50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2 text-slate-400 font-mono">{row._rowNumber}</td>
                      <td className="px-3 py-2 font-bold text-slate-700">{row.employeeNumber || '\u2014'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.firstName || '\u2014'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.lastName || '\u2014'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.department || '\u2014'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.branch || '\u2014'}</td>
                      <td className="px-3 py-2">
                        {row.status === 'valid' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                            <CheckCircle className="w-3 h-3" /> Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-start gap-1 px-2 py-1 rounded-lg bg-red-100 text-red-700 text-[10px] font-bold" title={row.reason}>
                            <XCircle className="w-3 h-3 shrink-0 mt-0.5" /> <span className="break-words">{row.reason}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="w-full bg-red-600 hover:bg-red-700 font-bold" onClick={handleBulkImport} disabled={isImporting || validCount === 0}>
              {isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</> : `Upload & Import ${validCount} Row${validCount !== 1 ? 's' : ''}`}
            </Button>
          </div>
          );
        })()}

        {importStep === 'results' && (() => {
          const succeeded = importResults.filter(r => r.status === 'success').length;
          const failed = importResults.filter(r => r.status === 'failed').length;
          const skippedInvalid = importParsedRows.filter(r => r.status === 'invalid').length;
          return (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-slate-700">{importResults.length}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attempted</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-green-600">{succeeded}</p>
                <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Succeeded</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${failed > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <p className={`text-2xl font-black ${failed > 0 ? 'text-red-600' : 'text-slate-400'}`}>{failed}</p>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${failed > 0 ? 'text-red-400' : 'text-slate-400'}`}>Failed</p>
              </div>
            </div>
            {skippedInvalid > 0 && (
              <p className="text-xs text-slate-400 text-center">{skippedInvalid} invalid row{skippedInvalid !== 1 ? 's were' : ' was'} skipped before sending.</p>
            )}
            {failed > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Failed Rows</p>
                <div className="max-h-[30vh] overflow-auto border border-red-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-red-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-black text-red-400 uppercase">Row</th>
                        <th className="px-3 py-2 text-left text-[10px] font-black text-red-400 uppercase">Emp. No.</th>
                        <th className="px-3 py-2 text-left text-[10px] font-black text-red-400 uppercase">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {importResults.filter(r => r.status === 'failed').map((r, idx) => (
                        <tr key={idx} className="bg-red-50/50">
                          <td className="px-3 py-2 text-slate-500 font-mono">{r.row}</td>
                          <td className="px-3 py-2 font-bold text-slate-700">{r.employeeNumber || '\u2014'}</td>
                          <td className="px-3 py-2 text-red-600">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex items-center justify-center pt-2 border-t border-slate-100">
              <Button className="px-10 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl" onClick={() => { setIsOpen(false); resetState(); onImportComplete(); }}>Done</Button>
            </div>
          </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
