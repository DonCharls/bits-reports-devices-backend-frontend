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
      
      const parsed = dataRows.map((raw, idx) => {
        const n: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) n[k.replace(/[\s_]+/g, '').toLowerCase()] = v instanceof Date ? v.toISOString() : String(v ?? '').trim();
        
        const errors: string[] = [];
        const empNum = n['employeenumber'] || n['employeeid'] || '';
        const firstName = n['firstname'] || '';
        const lastName = n['lastname'] || '';
        const email = n['email'] || n['emailaddress'] || '';
        const contactNumber = (n['contactnumber'] || '').replace(/\s/g, '');
        const department = n['department'] || '';
        const branch = n['branch'] || '';
        const shiftCode = n['shiftcode'] || n['shift'] || undefined;

        if (!empNum) errors.push('Missing emp#');
        if (!firstName) errors.push('Missing first name');
        if (!lastName) errors.push('Missing last name');
        if (!email) errors.push('Missing email');
        if (!contactNumber) errors.push('Missing contact');
        if (!department) errors.push('Missing department');
        if (!branch) errors.push('Missing branch');
        if (department && !deptNames.includes(department)) errors.push('Invalid dept');
        if (branch && !branchNames.includes(branch)) errors.push('Invalid branch');
        
        let resolvedShiftId: number | null = null;
        if (shiftCode) {
          const ms = shifts.find(s => s.shiftCode === shiftCode);
          if (!ms) errors.push('Invalid shift'); else resolvedShiftId = ms.id;
        }

        return {
          _rowNumber: idx + 2, employeeNumber: empNum, firstName, lastName,
          middleName: n['middlename'], suffix: n['suffix'], gender: n['gender'],
          dateOfBirth: n['dateofbirth'], email, contactNumber, department, branch,
          hireDate: n['hiredate'], shiftCode, shiftId: resolvedShiftId,
          status: errors.length === 0 ? 'valid' : 'invalid', reason: errors.join('; ')
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
      const res = await fetch('/api/employees/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: validRows })
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
        <Button variant="outline" className="flex-1 sm:flex-none border-border hover:bg-slate-50 gap-2 text-foreground">
          <Upload className="w-4 h-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={`bg-white border-0 p-0 rounded-2xl overflow-hidden shadow-xl ${importStep === 'select' ? 'sm:max-w-md' : 'sm:max-w-4xl'}`}>
        <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
          <div>
            <DialogTitle className="text-white font-bold text-lg">Import Employees</DialogTitle>
            <DialogDescription className="text-white/80 text-[10px] uppercase font-bold mt-1">Upload from Excel</DialogDescription>
          </div>
          <button onClick={() => { setIsOpen(false); resetState(); }} className="text-white/80 hover:text-white"><XIcon className="w-5 h-5" /></button>
        </div>

        {importStep === 'select' && (
          <div className="p-6">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center mb-4">
              <Upload className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <label htmlFor="excel-upload" className="cursor-pointer text-sm text-red-500 font-bold hover:underline">
                Click to select file
                <input id="excel-upload" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setImportFile(f); parseAndValidateFile(f); } }} />
              </label>
              <p className="text-xs text-slate-400 mt-1">Max {MAX_IMPORT_ROWS} rows</p>
            </div>
            {importFileError && <p className="text-sm text-red-500 bg-red-50 p-2 rounded mb-4">{importFileError}</p>}
            <Button variant="ghost" className="w-full text-red-600 font-bold" onClick={handleDownloadTemplate} disabled={isDownloadingTemplate}>
              {isDownloadingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Download Template'}
            </Button>
          </div>
        )}

        {importStep === 'preview' && (
          <div className="p-6">
            <div className="flex justify-between mb-4">
              <span className="font-bold">{importParsedRows.filter(r => r.status === 'valid').length} Valid Rows</span>
              <Button variant="ghost" size="sm" onClick={resetState}><RotateCcw className="w-4 h-4 mr-1"/> Check Another</Button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto mb-4 border rounded">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr><th className="p-2">Row</th><th className="p-2">Emp#</th><th className="p-2">Name</th><th className="p-2">Status</th></tr>
                </thead>
                <tbody>
                  {importParsedRows.map(r => (
                    <tr key={r._rowNumber} className={r.status === 'invalid' ? 'bg-red-50' : ''}>
                      <td className="p-2">{r._rowNumber}</td><td className="p-2">{r.employeeNumber}</td><td className="p-2">{r.firstName} {r.lastName}</td>
                      <td className="p-2">{r.status === 'valid' ? <CheckCircle className="w-4 h-4 text-green-500"/> : <span title={r.reason}><XCircle className="w-4 h-4 text-red-500" /></span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="w-full bg-red-600 hover:bg-red-700" onClick={handleBulkImport} disabled={isImporting || importParsedRows.filter(r => r.status === 'valid').length === 0}>
              {isImporting ? 'Importing...' : 'Upload & Import'}
            </Button>
          </div>
        )}

        {importStep === 'results' && (
          <div className="p-6 text-center">
            <h3 className="text-2xl font-black text-green-600 mb-2">{importResults.filter(r => r.status === 'success').length} Imported</h3>
            <Button className="w-full" onClick={() => { setIsOpen(false); resetState(); onImportComplete(); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
