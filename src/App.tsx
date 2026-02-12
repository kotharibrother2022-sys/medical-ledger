console.log('[DEBUG] App.tsx module loading...');
import React, { useState, useEffect, useMemo, useDeferredValue, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import { fetchLedgerData, fetchAllYearsData, updateLedgerEntry, type LedgerEntry, type FinancialYear, YEAR_GIDS, CACHE_VERSION } from './services/sheetService';
// @ts-ignore
import { List } from 'react-window';
// @ts-ignore
import { AutoSizer } from 'react-virtualized-auto-sizer';
import {
  Search,
  Calendar,
  Clock,
  LayoutDashboard,
  Filter,
  BarChart3,
  Users,
  FileText,
  FileDown,
  Tags,
  Check,

  BookOpen,
  RefreshCw,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react';
import { format, parse } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Define type for jsPDF with AutoTable
interface jsPDFWithAutoTable extends jsPDF {
  lastAutoTable: {
    finalY: number;
  };
}

// --- Shared PDF Generator ---
const generateAndSharePDF = async (entries: LedgerEntry[], title: string, subtitle: string, totalLabel: string = "TOTAL DUE") => {
  if (!entries || entries.length === 0) return;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(22);
  doc.setTextColor(37, 99, 235);
  doc.text('KOTHARI BROTHERS', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('A PHARMACEUTICAL DEALERS', pageWidth / 2, 26, { align: 'center' });
  doc.line(20, 35, pageWidth - 20, 35);

  // Metadata
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(title.toUpperCase(), 20, 45);
  doc.setFontSize(10);
  doc.text(`Report Date: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 20, 52);
  doc.text(subtitle, 20, 57);

  // Table
  const tableData = entries.map(entry => [
    entry.date,
    entry.party,
    entry.invoiceNo,
    `Rs. ${(entry.amount || 0).toLocaleString('en-IN')}`
  ]);

  autoTable(doc, {
    startY: 65,
    head: [['Date', 'Party Name', 'Invoice No', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: { 3: { halign: 'right' } }
  });

  // Footer / Totals
  const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
  // Use the extended type to access lastAutoTable
  const finalY = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalLabel}: Rs. ${totalAmount.toLocaleString('en-IN')}`, pageWidth - 20, finalY, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('Computer generated statement.', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

  // Share
  const pdfBlob = doc.output('blob');
  const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
  const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title,
        text: `Please find attached: ${title}. ${totalLabel}: Rs. ${totalAmount.toLocaleString('en-IN')}`
      });
    } catch (err) {
      console.error('Share failed', err);
      // doc.save(fileName); // Optional: Auto download on fail? User might prefer just staying.
    }
  } else {
    doc.save(fileName);
    alert("Sharing not supported on this device/browser. File downloaded.");
  }
};

// --- Compact Card Component (Unified High-Density UI) ---
const CompactCard = ({ entry, onUpdateStatus, updatingInvoice, onPartyClick }: any) => {
  const status = (entry.narration || '').toLowerCase();
  const isSettled = status === 'received' || status === 'cancel' || status === 'credit note' || status === 'delete';
  const isOverdue = entry.dueDays > 30 && !isSettled;
  const isReceived = status === 'received';
  const isCancelled = status === 'cancel' || status === 'credit note' || status === 'delete';
  const isUpdating = updatingInvoice === entry.invoiceNo;

  const colourLower = (entry.colour || '').toLowerCase();

  // Debug: Log color values to console
  if (entry.colour) {
    console.log(`[COLOR DEBUG] Invoice ${entry.invoiceNo}: colour="${entry.colour}", colourLower="${colourLower}"`);
  }

  const getCardStyle = () => {
    if (isReceived) return 'border-green-200 bg-green-50/40';
    if (isCancelled) return 'border-gray-200 bg-gray-50/30 grayscale opacity-70';
    if (entry.comment) return 'border-l-4 border-l-amber-400 border-y border-r border-gray-200 bg-amber-50/30 shadow-md transform scale-[1.01]';
    if (colourLower.includes('yellow')) return 'border-amber-400 bg-yellow-100 shadow-md ring-1 ring-amber-300';
    if (colourLower.includes('red')) return 'border-red-400 bg-red-100 shadow-md ring-1 ring-red-200';
    if (colourLower.includes('blue')) return 'border-blue-400 bg-blue-100 shadow-md ring-1 ring-blue-200';
    if (colourLower.includes('green')) return 'border-green-400 bg-green-100 shadow-md ring-1 ring-green-200';
    if (isOverdue) return 'border-red-200 bg-red-50/30';
    return 'border-blue-100 bg-white/50';
  };

  return (
    <div
      onClick={() => onPartyClick && onPartyClick(entry.party)}
      className={`glass rounded-xl p-3.5 transition-all hover:scale-[1.01] active:scale-95 cursor-pointer ${getCardStyle()} ${isUpdating ? 'opacity-50 animate-pulse' : ''}`}
    >
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded leading-none uppercase border border-primary-100">
            #{entry.invoiceNo}
          </span>
          {entry.colour && (
            <div
              className="w-2.5 h-2.5 rounded-full shadow-sm ring-1 ring-white"
              style={{ backgroundColor: entry.colour.toLowerCase() }}
            />
          )}
        </div>
        <div className="flex items-center text-gray-900">
          <span className="text-base font-black tracking-tight">₹{(entry.amount || 0).toLocaleString('en-IN')}</span>
        </div>
      </div>

      <h3 className="text-sm font-black text-gray-800 leading-none mb-2.5 truncate uppercase tracking-tight">{entry.party}</h3>

      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onUpdateStatus) onUpdateStatus(entry.invoiceNo, entry.narration);
            }}
            className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase whitespace-nowrap shadow-sm cursor-pointer hover:opacity-80 transition-opacity ${isReceived ? 'bg-green-100 text-green-700' :
              isCancelled ? 'bg-gray-100 text-gray-700' :
                isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
              }`}>
            {entry.narration || 'UNPAID'}
          </div>

          <div className="flex items-center text-gray-500 bg-white/40 px-1.5 py-0.5 rounded border border-gray-50">
            <Calendar size={10} className="mr-1 opacity-60" />
            <span className="text-[10px] font-bold">{entry.date}</span>
          </div>
        </div>

        <div className={`flex items-center text-[10px] font-black px-1.5 py-0.5 rounded-lg ${isOverdue ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
          <Clock size={10} className="mr-1 opacity-70" />
          <span>{entry.dueDays}D</span>
        </div>
      </div>

      {entry.dueDate && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold text-blue-700/80 bg-blue-50/50 px-2 py-0.5 rounded border border-blue-100/30">
          <Calendar size={10} className="opacity-60" />
          <span>Due: {entry.dueDate}</span>
        </div>
      )}

      {entry.comment && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold text-amber-700/80 bg-amber-50/50 px-2 py-0.5 rounded border border-amber-100/30 italic truncate">
          <FileText size={10} className="opacity-60" />
          <span>"{entry.comment}"</span>
        </div>
      )}
    </div>
  );
};

const Row = ({ index, style, entries, onUpdateStatus, updatingInvoice, onPartyClick }: any) => {
  if (!entries) return null;
  const entry = entries?.[index];
  if (!entry) return null;

  return (
    <div style={style} className="px-4 py-1.5">
      <CompactCard
        entry={entry}
        onUpdateStatus={onUpdateStatus}
        updatingInvoice={updatingInvoice}
        onPartyClick={onPartyClick}
      />
    </div>
  );
};

// --- Table View Header ---
const TableViewHeader = () => (
  <div className="flex bg-slate-200/50 border-b border-gray-200 px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-tighter sticky top-0 z-10 backdrop-blur-sm">
    <div className="w-16">Inv #</div>
    <div className="w-20 text-right pr-2">Date</div>
    <div className="flex-1 min-w-0 px-2">Party Name</div>
    <div className="w-24 text-right">Amount</div>
    <div className="w-20 text-center">Status</div>
    <div className="w-16 text-right">Age</div>
    <div className="w-20 text-right">Due Date</div>
  </div>
);

// --- Table View Row ---
const TableRow = ({ index, style, entries, onUpdateStatus, updatingInvoice, onPartyClick }: any) => {
  if (!entries) return null;
  const entry = entries?.[index];
  if (!entry) return null;

  const status = (entry.narration || '').toLowerCase();
  const isSettled = status === 'received' || status === 'cancel' || status === 'credit note' || status === 'delete';
  const isOverdue = entry.dueDays > 30 && !isSettled;
  const isReceived = status === 'received';
  const isCancelled = status === 'cancel' || status === 'credit note' || status === 'delete';
  const isUpdating = updatingInvoice === entry.invoiceNo;

  const colourLower = (entry.colour || '').toLowerCase();
  const getRowStyle = () => {
    if (isReceived) return 'bg-green-50/20';
    if (isCancelled) return 'bg-gray-50/40 grayscale opacity-60';
    if (colourLower.includes('yellow')) return 'bg-yellow-100 border-amber-200';
    if (colourLower.includes('red')) return 'bg-red-100 border-red-200';
    if (colourLower.includes('blue')) return 'bg-blue-100 border-blue-200';
    if (colourLower.includes('green')) return 'bg-green-100 border-green-200';
    if (isOverdue) return 'bg-red-50/20';
    return (index % 2 === 0) ? 'bg-white' : 'bg-slate-50/30';
  };

  return (
    <div style={style} className={`flex items-center px-4 border-b border-gray-100 hover:bg-blue-50/50 transition-colors cursor-pointer group ${getRowStyle()}`} onClick={() => onPartyClick(entry.party)}>
      <div className="w-16 text-[9px] font-bold text-gray-400">#{entry.invoiceNo}</div>
      <div className="w-20 text-right text-[10px] font-bold text-gray-500 whitespace-nowrap pr-2">{entry.date}</div>
      <div className="flex-1 min-w-0 px-2">
        <div className="flex items-center gap-1.5">
          {entry.colour && (
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.colour.toLowerCase() }} />
          )}
          <span className="text-[11px] font-black text-gray-800 truncate leading-none uppercase tracking-tight">{entry.party}</span>
        </div>
      </div>
      <div className="w-24 text-right text-[11px] font-black text-gray-900 leading-none">₹{(entry.amount || 0).toLocaleString('en-IN')}</div>
      <div className="w-20 flex justify-center px-2">
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (onUpdateStatus) onUpdateStatus(entry.invoiceNo, entry.narration);
          }}
          className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase whitespace-nowrap border shadow-xs transition-opacity ${isReceived ? 'bg-green-100 text-green-700 border-green-200' :
            isCancelled ? 'bg-gray-100 text-gray-700 border-gray-200' :
              isOverdue ? 'bg-red-100 text-red-700 border-red-200' : 'bg-blue-100 text-blue-700 border-blue-200'
            } ${isUpdating ? 'animate-pulse opacity-50' : 'hover:opacity-80'}`}>
          {entry.narration || 'UNPAID'}
        </div>
      </div>
      <div className={`w-16 text-right text-[10px] font-black ${isOverdue ? 'text-red-600' : 'text-gray-400'}`}>{entry.dueDays}D</div>
      <div className="w-20 text-right text-[10px] font-bold text-blue-600 whitespace-nowrap">{entry.dueDate || '-'}</div>
    </div>
  );
};

// Ledger View Component
const LedgerView = ({
  data,
  selectedParty,
  setSelectedParty
}: {
  data: LedgerEntry[],
  selectedParty: string,
  setSelectedParty: (party: string) => void
}) => {
  const [showDueOnly, setShowDueOnly] = useState(false);

  const exportToPDF = () => {
    if (!selectedParty || partyLedger.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235);
    doc.text('KOTHARI BROTHERS', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('A PHARMACEUTICAL DEALERS', pageWidth / 2, 26, { align: 'center' });

    // 2. Party Details
    doc.line(20, 35, pageWidth - 20, 35);

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`Party: ${selectedParty.toUpperCase()}`, 20, 45);

    doc.setFontSize(10);
    doc.text(`Report Date: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 20, 52);
    doc.text(`Filter: ${showDueOnly ? 'Pending Bills Only' : 'All Transactions'}`, 20, 57);

    const tableData = partyLedger.map(entry => [
      entry.date,
      entry.invoiceNo,
      entry.narration || 'BLANK',
      `Rs. ${(entry.amount || 0).toLocaleString('en-IN')}`
    ]);

    autoTable(doc, {
      startY: 65,
      head: [['Date', 'Invoice No', 'Narration', 'Amount']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 3: { halign: 'right' } }
    });

    const finalY = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL BALANCE DUE: Rs. ${totals.totalDue.toLocaleString('en-IN')}`, pageWidth - 20, finalY, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('This is a computer generated statement.', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

    doc.save(`${selectedParty.replace(/\s+/g, '_')}_Ledger.pdf`);
  };



  // Get unique parties for the dropdown
  const parties = useMemo(() => {
    return Array.from(new Set(data.map(e => e.party))).filter(Boolean).sort();
  }, [data]);

  // Filter Data
  const partyLedger = useMemo(() => {
    if (!selectedParty) return [];

    return data.filter(entry => {
      // 1. Party Match
      if (entry.party !== selectedParty) return false;

      // 3. Due Only Match
      if (showDueOnly) {
        const status = (entry.narration || '').toLowerCase();
        // If it IS settled, we EXCLUDE it. 
        // Settled = received, cancel, delete, credit note
        const isSettled = status.includes('received') || status.includes('cancel') || status.includes('delete') || status.includes('credit note');
        if (isSettled) return false;
      }

      return true;
    });
  }, [data, selectedParty, showDueOnly]);

  // Calculate Totals
  const totals = useMemo(() => {
    return partyLedger.reduce((acc, entry) => {
      const amount = entry.amount || 0;
      const status = (entry.narration || '').toLowerCase();
      const isSettled = status.includes('received') || status.includes('cancel') || status.includes('delete');

      return {
        totalAmount: acc.totalAmount + amount,
        totalDue: acc.totalDue + (isSettled ? 0 : amount),
        totalPaid: acc.totalPaid + (isSettled ? amount : 0)
      };
    }, { totalAmount: 0, totalDue: 0, totalPaid: 0 });
  }, [partyLedger]);

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Filters Header */}
      <div className="p-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-gray-100 space-y-4">

        {/* Party Selector */}
        <div className="flex justify-between items-end gap-2">
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Select Party</label>
            <select
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-primary-500"
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
            >
              <option value="">Choose a Party...</option>
              {parties.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {selectedParty && partyLedger.length > 0 && (
            <div className="flex flex-col gap-2 animate-in slide-in-from-top-2">
              <div className="flex gap-2 items-stretch">
                {/* Compact Total Balance Card */}
                <div className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-lg flex justify-between items-center">
                  <div>
                    <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Total Due</p>
                    <p className="text-lg font-black leading-none bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                      ₹{totals.totalDue.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right pl-4 border-l border-gray-700">
                    <p className="text-xl font-black leading-none">{partyLedger.length}</p>
                    <p className="text-[8px] font-bold text-gray-500 uppercase">Bills</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => generateAndSharePDF(partyLedger, `Ledger_${selectedParty}`, `Full Statement`, "TOTAL DUE")}
                    className="bg-[#25D366] text-white px-4 rounded-xl shadow-lg shadow-green-200 active:scale-90 transition-all flex items-center justify-center"
                    title="Share to WhatsApp"
                  >
                    <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                      <span className="text-[12px] font-extrabold text-[#25D366]">W</span>
                    </div>
                  </button>
                  <button
                    onClick={exportToPDF}
                    className="bg-primary-600 text-white px-4 rounded-xl shadow-lg shadow-primary-200 active:scale-90 transition-all flex items-center justify-center"
                    title="Download PDF"
                  >
                    <FileDown size={20} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedParty && (
          <div className="flex gap-4 items-center">
            {/* Due Only Toggle - Simplified */}
            <button
              onClick={() => setShowDueOnly(!showDueOnly)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-300 transition-all active:scale-95 bg-white text-gray-400"
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${showDueOnly ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                {showDueOnly && <Check size={10} className="text-white" />}
              </div>
              <span className="text-xs font-bold uppercase whitespace-nowrap">Show Dues Only</span>
            </button>
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-auto p-4 space-y-3 pb-32">
        {!selectedParty ? (
          <div className="text-center py-20 opacity-50">
            <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="font-bold text-gray-400">Select a party to view ledger</p>
          </div>
        ) : partyLedger.length === 0 ? (
          <div className="text-center py-20 opacity-50">
            <p className="font-bold text-gray-400">No records found</p>
          </div>
        ) : (
          partyLedger.map((entry, idx) => (
            <CompactCard
              key={idx}
              entry={entry}
              onPartyClick={setSelectedParty}
            />
          ))
        )}
      </div>


    </div >
  );
};

// Ageing View Component
const AgeingView = ({
  data,
  selectedGroup,
  onPartyClick
}: {
  data: LedgerEntry[],
  selectedGroup: string,
  onPartyClick: (party: string) => void
}) => {
  const filteredData = useMemo(() => {
    return data.filter(entry => {
      // 1. Must be strictly DUE (not settled)
      const status = (entry.narration || '').toLowerCase();
      const isSettled = status === 'received' || status === 'cancel' || status === 'credit note' || status === 'delete';
      if (isSettled) return false;

      // 2. Match Age Group
      const d = entry.dueDays;
      if (selectedGroup === '0-30 Days') return d <= 30;
      if (selectedGroup === '31-60 Days') return d > 30 && d <= 60;
      if (selectedGroup === '61-90 Days') return d > 60 && d <= 90;
      if (selectedGroup === '91+ Days') return d > 90;
      return false;
    });
  }, [data, selectedGroup]);

  // Totals
  const totalAmount = useMemo(() => filteredData.reduce((acc, curr) => acc + (curr.amount || 0), 0), [filteredData]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header Card */}
      <div className="p-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-gray-100">
        <div className="flex items-stretch gap-2 animate-in slide-in-from-top-2">
          <div className="flex-1 bg-red-600 text-white px-4 py-2 rounded-xl shadow-lg flex justify-between items-center shadow-red-200">
            <div>
              <p className="text-[8px] text-red-100 font-bold uppercase tracking-wider mb-0.5">Overdue: {selectedGroup}</p>
              <p className="text-lg font-black leading-none bg-gradient-to-r from-white to-red-200 bg-clip-text text-transparent">
                ₹{totalAmount.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="text-right pl-4 border-l border-red-400/30">
              <p className="text-xl font-black leading-none text-white">{filteredData.length}</p>
              <p className="text-[8px] font-bold text-red-100 uppercase">Bills</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => generateAndSharePDF(filteredData, `Ageing_${selectedGroup.replace(/\s+/g, '')}`, `Outstanding Bills (${selectedGroup})`, "TOTAL OVERDUE")}
              className="bg-[#25D366] text-white px-4 rounded-xl shadow-lg shadow-green-200 active:scale-90 transition-all flex items-center justify-center"
              title="Share PDF to WhatsApp"
            >
              <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                <span className="text-[12px] font-extrabold text-[#25D366]">W</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-4 space-y-3 pb-32">
        {filteredData.length === 0 ? (
          <div className="text-center py-20 opacity-50">
            <Clock size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="font-bold text-gray-400">No overdue bills in this range</p>
          </div>
        ) : (
          filteredData.map((entry, idx) => (
            <CompactCard
              key={idx}
              entry={entry}
              onPartyClick={onPartyClick}
            />
          ))
        )}
      </div>
    </div>
  );
};

const ReportsView = ({
  data,
  onPartyClick,
  onNarrationClick,
  onAgeingClick
}: {
  data: LedgerEntry[],
  onPartyClick: (party: string) => void,
  onNarrationClick: (narration: string) => void,
  onAgeingClick: (group: string) => void
}) => {
  const pendingData = useMemo(() => data.filter(entry => {
    const status = (entry.narration || '').toLowerCase();
    const isSettled = status === 'received' || status === 'cancel' || status === 'credit note' || status === 'delete';
    return !isSettled;
  }), [data]);

  const ageingGroups = useMemo(() => {
    const groups = {
      '0-30 Days': 0,
      '31-60 Days': 0,
      '61-90 Days': 0,
      '91+ Days': 0
    };
    pendingData.forEach(entry => {
      if (entry.dueDays <= 30) groups['0-30 Days'] += entry.amount;
      else if (entry.dueDays <= 60) groups['31-60 Days'] += entry.amount;
      else if (entry.dueDays <= 90) groups['61-90 Days'] += entry.amount;
      else groups['91+ Days'] += entry.amount;
    });
    return groups;
  }, [pendingData]);

  const narrationGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    pendingData.forEach(entry => {
      const nar = entry.narration || 'BLANK';
      groups[nar] = (groups[nar] || 0) + entry.amount;
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [pendingData]);

  const partyGroups = useMemo(() => {
    const groups: Record<string, { amount: number, bills: number, mobileNo: string }> = {};
    pendingData.forEach(entry => {
      if (!groups[entry.party]) groups[entry.party] = { amount: 0, bills: 0, mobileNo: entry.mobileNo || '' };
      groups[entry.party].amount += entry.amount;
      groups[entry.party].bills += 1;
      if (!groups[entry.party].mobileNo && entry.mobileNo) groups[entry.party].mobileNo = entry.mobileNo;
    });
    return Object.entries(groups).sort((a, b) => b[1].amount - a[1].amount);
  }, [pendingData]);

  return (
    <div className="p-4 space-y-6 pb-24 overflow-y-auto h-full no-scrollbar">
      {/* Ageing Summary */}
      <section>
        <div className="flex items-center mb-4">
          <Clock className="text-primary-600 mr-2" size={20} />
          <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider">Ageing Summary</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(ageingGroups).map(([label, amount]) => (
            <div
              key={label}
              onClick={() => onAgeingClick(label)}
              className="glass p-4 rounded-2xl border-l-4 border-primary-400 active:scale-95 transition-transform cursor-pointer hover:bg-primary-50"
            >
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{label}</p>
              <p className="text-lg font-black text-gray-900">₹{(amount / 1000).toFixed(1)}K</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Narration-wise Pending */}
        <section>
          <div className="flex items-center mb-4">
            <FileText className="text-primary-600 mr-2" size={20} />
            <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider">Narration-wise Pending</h2>
          </div>
          <div className="glass rounded-2xl overflow-hidden border border-gray-100">
            {narrationGroups.map(([narration, amount]) => (
              <div
                key={narration}
                onClick={() => onNarrationClick(narration)}
                className="flex justify-between items-center p-4 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors active:scale-[0.99]"
              >
                <div>
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-tighter bg-blue-50 px-2 py-0.5 rounded-full">{narration}</span>
                </div>
                <p className="font-bold text-gray-800">₹{(amount || 0).toLocaleString('en-IN')}</p>
              </div>
            ))}
            {narrationGroups.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No pending narration data</div>}
          </div>
        </section>

        {/* Party-wise Pending Bills */}
        <section>
          <div className="flex items-center mb-4">
            <Users className="text-primary-600 mr-2" size={20} />
            <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider">Party-wise Summary</h2>
          </div>
          <div className="space-y-3">
            {partyGroups.slice(0, 50).map(([party, stats]) => (
              <div
                key={party}
                onClick={() => onPartyClick(party)}
                className="glass p-4 rounded-2xl border border-gray-100 flex justify-between items-center active:scale-[0.98] cursor-pointer hover:border-primary-200 transition-all"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <h3 className="font-bold text-gray-800 text-sm truncate">{party}</h3>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">{stats.bills} Pending Bills</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="font-black text-primary-700">₹{(stats.amount || 0).toLocaleString('en-IN')}</p>

                </div>
              </div>
            ))}
            {partyGroups.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No pending party data</div>}
          </div>
        </section>
      </div>
    </div>
  );
};

const NarrationView = ({
  data,
  selectedNarration,
  setSelectedNarration,
  onPartyClick
}: {
  data: LedgerEntry[],
  selectedNarration: string,
  setSelectedNarration: (val: string) => void,
  onPartyClick: (party: string) => void
}) => {

  // Get unique narrations, excluding payment/settled ones
  const narrations = useMemo(() => {
    const relevant = data
      .map(e => (e.narration || 'BLANK').trim())
      .filter(n => {
        const low = n.toLowerCase();
        // Skip common settled status narrations for the selector
        return !low.includes('received') && !low.includes('cancel') && !low.includes('delete') && !low.includes('credit note');
      });
    return Array.from(new Set(relevant)).sort();
  }, [data]);

  // Filter Data: ONLY for selected narration AND strictly UNPAID
  const narrationLedger = useMemo(() => {
    if (!selectedNarration) return [];

    return data.filter(entry => {
      // 1. Narration Match (exact or closely matching)
      if ((entry.narration || 'BLANK') !== selectedNarration) return false;

      // 2. ONLY DUES (unpaid)
      const status = (entry.narration || '').toLowerCase();
      const isSettled = status.includes('received') || status.includes('cancel') || status.includes('delete') || status.includes('credit note');

      return !isSettled;
    });
  }, [data, selectedNarration]);

  // Calculate Totals
  const totals = useMemo(() => {
    let totalAmount = 0;
    narrationLedger.forEach(entry => {
      totalAmount += (entry.amount || 0);
    });
    return { totalAmount };
  }, [narrationLedger]);

  const exportToPDF = () => {
    if (!selectedNarration || narrationLedger.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235);
    doc.text('KOTHARI BROTHERS', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('A PHARMACEUTICAL DEALERS', pageWidth / 2, 26, { align: 'center' });

    // 2. Narration Details
    doc.line(20, 35, pageWidth - 20, 35);

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`Narration Group: ${selectedNarration.toUpperCase()}`, 20, 45);

    doc.setFontSize(10);
    doc.text(`Report Date: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 20, 52);
    doc.text(`Status: Strictly Due Entries Only`, 20, 57);

    // 3. Table
    const tableData = narrationLedger.map(entry => [
      entry.date,
      entry.party,
      entry.invoiceNo,
      `Rs. ${(entry.amount || 0).toLocaleString('en-IN')}`
    ]);

    autoTable(doc, {
      startY: 65,
      head: [['Date', 'Party Name', 'Invoice No', 'Amount']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: { 3: { halign: 'right' } }
    });

    const finalY = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL PENDING: Rs. ${totals.totalAmount.toLocaleString('en-IN')}`, pageWidth - 20, finalY, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Statement generated for record keeping.', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

    doc.save(`${selectedNarration.replace(/\s+/g, '_')}_Due_Report.pdf`);
  };



  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-gray-100">
        <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Select Narration (Only Dues)</label>
        <div className="flex gap-2">
          <select
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-primary-500"
            value={selectedNarration}
            onChange={(e) => setSelectedNarration(e.target.value)}
          >
            <option value="">Choose a Narration Group...</option>
            {narrations.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {selectedNarration && narrationLedger.length > 0 && (
          <div className="mt-3 flex items-stretch gap-2 animate-in slide-in-from-top-2">
            <div className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-lg flex justify-between items-center">
              <div>
                <p className="text-[8px] text-indigo-200 font-bold uppercase tracking-wider mb-0.5">Total Pending</p>
                <p className="text-lg font-black leading-none bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">
                  ₹{totals.totalAmount.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="text-right pl-4 border-l border-indigo-400/30">
                <p className="text-xl font-black leading-none text-white">{narrationLedger.length}</p>
                <p className="text-[8px] font-bold text-indigo-200 uppercase">Bills</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => generateAndSharePDF(narrationLedger, `Narration_${selectedNarration}`, "Pending Bills in Group", "TOTAL PENDING")}
                className="bg-[#25D366] text-white px-4 rounded-xl shadow-lg shadow-green-200 active:scale-90 transition-all flex items-center justify-center"
                title="Share PDF to WhatsApp"
              >
                <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                  <span className="text-[12px] font-extrabold text-[#25D366]">W</span>
                </div>
              </button>
              <button
                onClick={exportToPDF}
                className="bg-indigo-600 text-white px-4 rounded-xl shadow-lg shadow-indigo-200 active:scale-90 transition-all flex items-center justify-center"
              >
                <FileDown size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3 pb-32">
        {!selectedNarration ? (
          <div className="text-center py-20 opacity-50">
            <Tags size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="font-bold text-gray-400">Select a narration group to see pending bills</p>
          </div>
        ) : narrationLedger.length === 0 ? (
          <div className="text-center py-20 opacity-50">
            <p className="font-bold text-gray-400">No overdue records for this group</p>
          </div>
        ) : (
          narrationLedger.map((entry, idx) => (
            <CompactCard
              key={idx}
              entry={entry}
              onPartyClick={onPartyClick}
            />
          ))
        )}
      </div>


    </div>
  );
};

const DEFAULT_YEAR: FinancialYear = '25-26';

const AppContent: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<FinancialYear>(DEFAULT_YEAR);
  const [selectedParty, setSelectedParty] = useState<string>('');
  const [selectedNarration, setSelectedNarration] = useState<string>('');
  const [selectedAgeingGroup, setSelectedAgeingGroup] = useState<string>('');

  // DEFER LOADING: Initialize empty to allow first paint
  const [data, setData] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [, setRefreshing] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'ledger' | 'narration' | 'ageing' | 'settings'>('dashboard');

  const [, setLastUpdated] = useState<string | null>(() => {
    return localStorage.getItem(`cachedTime_${DEFAULT_YEAR}`);
  });

  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [updatingInvoice, setUpdatingInvoice] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    return (localStorage.getItem('preferredViewMode') as 'card' | 'table') || 'card';
  });

  useEffect(() => {
    localStorage.setItem('preferredViewMode', viewMode);
  }, [viewMode]);


  // Hard Reset Handler
  async function handleHardReset() {
    if (window.confirm("This will clear all local cache and reload the app from the server. Continue?")) {
      try {
        // Clear LocalStorage
        localStorage.clear();
        // Clear IndexedDB
        const yearsToClear = [...Object.keys(YEAR_GIDS), 'ALL_TIME'];
        for (const y of yearsToClear) {
          await set(`cachedLedgerData_${y}`, null);
        }
        // Force Reload
        window.location.reload();
      } catch (e) {
        console.error("Reset failed", e);
        alert("Reset failed. Please clear your browser data manually.");
      }
    }
  }

  // Quick Status Update Handler
  const handleUpdateStatus = async (invoiceNo: string, currentStatus: string) => {
    // Cycle through: PENDING (empty) -> RECEIVED -> PENDING
    const nextStatus = (currentStatus || '').toUpperCase() === 'RECEIVED' ? '' : 'RECEIVED';

    setUpdatingInvoice(invoiceNo);

    // 1. Optimistic Update (Immediate Feedback)
    setData(prev => prev.map(entry =>
      entry.invoiceNo === invoiceNo ? { ...entry, narration: nextStatus } : entry
    ));

    // 2. Persist to Sheet
    const success = await updateLedgerEntry(invoiceNo, nextStatus, selectedYear);

    if (!success) {
      // Revert if failed
      setData(prev => prev.map(entry =>
        entry.invoiceNo === invoiceNo ? { ...entry, narration: currentStatus } : entry
      ));
      setError(`Failed to update ${invoiceNo}. Please check script setup.`);
      setTimeout(() => setError(null), 3000);
    }

    setUpdatingInvoice(undefined);
  };

  // --- FILTER COMMANDS (States) ---
  const [showFilters, setShowFilters] = useState(false);
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string, end: string }>({ start: '', end: '' });

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    const len = data.length;
    for (let i = 0; i < len; i++) {
      const my = data[i].monthYear;
      if (my) months.add(my);
    }
    return Array.from(months).sort((a, b) => {
      try {
        const db = parse(b, 'MMMM yyyy', new Date());
        const da = parse(a, 'MMMM yyyy', new Date());
        return db.getTime() - da.getTime();
      } catch { return 0; }
    });
  }, [data]);




  const loadData = useCallback(async (year: FinancialYear = selectedYear, forceRefresh = false) => {
    try {
      // 1. Check Cache first (IndexedDB is async and doesn't block)
      const cachedData = await get(`cachedLedgerData_${year}`);
      const cachedTime = localStorage.getItem(`cachedTime_${year}`);

      if (cachedData && !forceRefresh) {
        // Check if cache is stale (older than 5 minutes)
        const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
        const cacheAge = cachedTime ? Date.now() - new Date(cachedTime).getTime() : Infinity;

        if (cacheAge > CACHE_MAX_AGE_MS) {
          console.log(`[CACHE] Data is ${Math.round(cacheAge / 60000)} minutes old. Refreshing...`);
          // Cache is stale, force refresh
          forceRefresh = true;
        } else {
          // Cache is fresh, use it
          setData(cachedData);
          setLastUpdated(cachedTime);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }

      // 2. Start Sync UI
      if (cachedData) {
        setRefreshing(true);
        if (data.length === 0) {
          setData(cachedData);
          setLastUpdated(cachedTime);
        }
      } else {
        setLoading(true);
      }

      setError(null);
      let ledgerData: LedgerEntry[] = [];
      const startTime = performance.now();

      // 3. Network Fetch
      if (year === 'ALL_TIME') {
        setLoadingProgress('Syncing all years (Live)...');
        ledgerData = await fetchAllYearsData(forceRefresh);
      } else {
        const source = forceRefresh ? 'Live' : 'Cache/JSON';
        setLoadingProgress(`Syncing ${year} (${source})...`);
        ledgerData = await fetchLedgerData(year, forceRefresh);
      }

      console.log(`[LOAD] Source: ${forceRefresh ? 'LIVE' : 'CACHE/JSON'}. Fetch took ${(performance.now() - startTime).toFixed(2)}ms for ${ledgerData.length} rows`);

      // 4. Update State & UI
      console.log('[LOAD] Setting data state with', ledgerData.length, 'records');
      setData(ledgerData);
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastUpdated(now);

      // 5. CACHE IN BACKGROUND (Use IndexedDB for large JSON)
      if (year !== 'ALL_TIME') {
        // No need for setTimeout here as IDB is async and set is usually efficient
        set(`cachedLedgerData_${year}`, ledgerData).catch(e => console.warn("IDB cache fail", e));
        localStorage.setItem(`cachedTime_${year}`, now);
        localStorage.setItem('app_cache_version', CACHE_VERSION);
      }

      setError(null);
    } catch (error) {
      console.error('Data Sync Error:', error);
      setError('Sync failed. Using offline data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingProgress('');
    }
  }, [selectedYear]);

  // Consolidated Initial Load & Version Management
  useEffect(() => {
    const manageCacheAndLoad = async () => {
      const currentV = localStorage.getItem('app_cache_version');
      if (currentV !== CACHE_VERSION) {
        console.log("Cache version mismatch. Clearing IndexedDB...");
        try {
          const yearsToClear = [...Object.keys(YEAR_GIDS), 'ALL_TIME'];
          for (const y of yearsToClear) {
            await set(`cachedLedgerData_${y}`, null);
            localStorage.removeItem(`cachedTime_${y}`);
          }
        } catch (e) {
          console.error("Failed to clear IDB cache", e);
        }
        localStorage.setItem('app_cache_version', CACHE_VERSION);
      }

      // Initial Load
      try {
        console.log('[INIT] Loading year:', selectedYear);
        const cached = await get(`cachedLedgerData_${selectedYear}`);
        if (cached && Array.isArray(cached) && cached.length > 0) {
          setData(cached);
          setLoading(false);
          setLastUpdated(localStorage.getItem(`cachedTime_${selectedYear}`));
          // Background sync to ensure data is fresh
          loadData(selectedYear, false);
        } else {
          loadData(selectedYear, true);
        }
      } catch (e) {
        console.error("[INIT] Load failed", e);
        loadData(selectedYear, true);
      }
    };

    manageCacheAndLoad();
    document.title = "KOTHARI BROTHERS";
  }, [selectedYear, loadData]);


  const deferredSearch = useDeferredValue(searchQuery);

  const { filteredData, metrics } = useMemo(() => {
    const searchWords = deferredSearch.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 0);
    const hasSearch = searchWords.length > 0;

    // Simplified filtering result container
    const results: LedgerEntry[] = [];
    let totOutstanding = 0;
    let totReceived = 0;
    let totBill = 0;

    // SINGLE PASS LOOP
    const len = data.length;
    for (let i = 0; i < len; i++) {
      const entry = data[i];


      // 1. SEARCH FILTER
      if (hasSearch) {
        let matchesAll = true;
        const searchStr = entry.searchString || '';
        for (let j = 0; j < searchWords.length; j++) {
          if (!searchStr.includes(searchWords[j])) {
            matchesAll = false;
            break;
          }
        }
        if (!matchesAll) continue;
      }

      // 2. [DATE_FILTER_FUNCTION]
      const applyDateFilter = () => {
        if (filterMonth && entry.monthYear !== filterMonth) return false;

        let startBound: number | null = null;
        let endBound: number | null = null;

        if (dateRange.start) {
          const p = dateRange.start.split('-');
          startBound = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])).setHours(0, 0, 0, 0);
        }
        if (dateRange.end) {
          const p = dateRange.end.split('-');
          endBound = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])).setHours(23, 59, 59, 999);
        }

        const ts = entry.timestamp || 0;
        if (startBound && (ts === 0 || ts < startBound)) return false;
        if (endBound && (ts === 0 || ts > endBound)) return false;

        return true;
      };
      if (!applyDateFilter()) continue;

      // 3. STATUS LOGIC
      const status = (entry.narration || '').toUpperCase();
      const isExcluded = ['DELETE', 'CANCEL', 'CREDIT NOTE'].includes(status);
      const isPaid = ['RECEIVED', 'BOOK', 'SUSPENSE'].includes(status);
      const isOutstanding = !isExcluded && !isPaid;
      const isSettled = isPaid || isExcluded;

      // 4. [PENDING_FILTER_FUNCTION]
      const applyPendingFilter = () => {
        if (pendingOnly && isSettled) return false;
        return true;
      };
      if (!applyPendingFilter()) continue;

      // MATCH!
      results.push(entry);

      // 5. ACCUMULATE METRICS
      if (!isExcluded) totBill += entry.amount;
      if (isPaid) totReceived += entry.amount;
      if (isOutstanding) totOutstanding += entry.amount;
    }

    return {
      filteredData: results,
      metrics: { totalOutstanding: totOutstanding, totalReceived: totReceived, totalBill: totBill }
    };
  }, [data, deferredSearch, pendingOnly, showFilters, filterMonth, dateRange]);

  const { totalOutstanding, totalReceived, totalBill } = metrics;



  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center p-8">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-6 shadow-xl shadow-primary-100"></div>
          <p className="text-gray-900 font-black text-lg uppercase tracking-widest">KOTHARI BROTHERS</p>
          <p className="text-gray-500 font-bold text-xs mt-2 uppercase animate-pulse">{loadingProgress || 'Loading Data...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="glass sticky top-0 z-50 px-4 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <div className="bg-primary-600 p-2 rounded-xl text-white mr-3 shadow-lg shadow-primary-200">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">KOTHARI <span className="text-primary-600">BROTHERS</span></h1>
                <div className="flex gap-1 items-center">
                  <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-amber-200">{CACHE_VERSION} ({new Date().toLocaleTimeString()})</span>
                  <span className="bg-slate-100 text-slate-700 text-[8px] font-black px-1.5 py-0.5 rounded-full border border-slate-200">RAW: {data.length}</span>
                </div>
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mt-0.5 whitespace-nowrap">A PHARMACEUTICAL DEALERS</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => loadData(selectedYear, true)}
              disabled={loading}
              className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 p-2 rounded-lg shadow-sm transition-all active:scale-90 disabled:opacity-50 flex items-center gap-2"
              title="Force Sync from Google Sheet"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-primary-600' : ''} />
              <span className="text-[10px] font-bold uppercase hidden sm:inline">Sync</span>
            </button>
            <button
              onClick={handleHardReset}
              className="bg-red-600 text-white hover:bg-red-700 p-2 rounded-lg shadow-md shadow-red-100 transition-all active:scale-90 flex items-center gap-2"
              title="Clear all cache and reload"
            >
              <RefreshCw size={14} />
              <span className="text-[10px] font-bold uppercase hidden sm:inline">Reset</span>
            </button>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value as FinancialYear)}
              className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
            >
              {Object.keys(YEAR_GIDS).map(year => (
                <option key={year} value={year}>FY {year}</option>
              ))}
              <option value="ALL_TIME">All Years</option>
            </select>
          </div>
        </div>

        {/* Dashboard Actions Bar */}
        <div className="flex gap-2">
          {activeTab === 'dashboard' && (
            <div className="relative group flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              </div>
              <input
                type="text"
                className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all shadow-sm group-hover:shadow-md text-gray-900 placeholder-gray-400"
                placeholder="Search Party, Bill No, Mobile..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}


          <button
            onClick={() => setPendingOnly(!pendingOnly)}
            className={`px-4 rounded-2xl border transition-all flex items-center gap-2 font-bold text-sm ${pendingOnly
              ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-200'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            title="FILTER PENDING ITEMS"
          >
            <Clock size={18} />
            <span className="hidden sm:inline">{pendingOnly ? 'UNPAID Pending BILL' : 'ALL BILL'}</span>
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 rounded-2xl border transition-all flex items-center gap-2 font-bold text-sm ${showFilters
              ? 'bg-primary-500 border-primary-500 text-white shadow-lg shadow-primary-200'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            title="OPEN DATE FILTER"
          >
            <Filter size={18} />
            <span className="hidden sm:inline">DATE FILTER</span>
          </button>

          <div className="flex bg-white/50 border border-gray-200 rounded-2xl p-1 shadow-sm">
            <button
              onClick={() => setViewMode('card')}
              className={`p-2 rounded-xl transition-all ${viewMode === 'card' ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              title="Grid View"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-xl transition-all ${viewMode === 'table' ? 'bg-primary-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              title="Table View"
            >
              <ListIcon size={18} />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 p-4 glass rounded-2xl border border-gray-100 animate-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-800 text-xs flex items-center gap-2 uppercase tracking-widest">
                <Calendar size={16} className="text-primary-600" />
                Date Range Filter
              </h3>
              <button
                onClick={() => { setFilterMonth(''); setDateRange({ start: '', end: '' }); }}
                className="text-[10px] font-bold text-red-500 uppercase hover:underline"
              >
                Reset Dates
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">By Month</label>
                <select
                  value={filterMonth}
                  onChange={(e) => { setFilterMonth(e.target.value); setDateRange({ start: '', end: '' }); }}
                  className="w-full bg-white/50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none"
                >
                  <option value="">All Months</option>
                  {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Start</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => { setDateRange(prev => ({ ...prev, start: e.target.value })); setFilterMonth(''); }}
                    className="w-full bg-white/50 border border-gray-200 rounded-xl px-2 py-2 text-[10px] font-bold text-gray-700 outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">End</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => { setDateRange(prev => ({ ...prev, end: e.target.value })); setFilterMonth(''); }}
                    className="w-full bg-white/50 border border-gray-200 rounded-xl px-2 py-2 text-[10px] font-bold text-gray-700 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <p className="text-xs font-bold text-red-700">{error}</p>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'dashboard' ? (
          <>
            <div className="flex gap-4 px-4 overflow-x-auto no-scrollbar pb-2">
              <div className="flex-shrink-0 w-44 bg-white p-3 rounded-xl border-l-4 border-slate-500 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Total Bill</p>
                <p className="text-base font-black text-slate-900 tabular-nums">
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalBill)}
                </p>
              </div>
              <div className="flex-shrink-0 w-44 bg-white p-3 rounded-xl border-l-4 border-green-500 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-black text-green-600 uppercase tracking-wider mb-0.5">Total Received</p>
                <p className="text-base font-black text-green-700 tabular-nums">
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalReceived)}
                </p>
              </div>
              <div className="flex-shrink-0 w-44 bg-white p-3 rounded-xl border-l-4 border-red-500 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-wider mb-0.5">Total Due</p>
                <p className="text-base font-black text-red-700 tabular-nums">
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalOutstanding)}
                </p>
              </div>
            </div>

            <div className={`flex-1 min-h-0 bg-slate-50 relative overflow-hidden flex flex-col ${viewMode === 'table' ? 'rounded-b-2xl border-x border-b border-gray-100' : ''}`}>
              {viewMode === 'table' && <TableViewHeader />}
              <div className="flex-1">
                {/* @ts-ignore */}
                <AutoSizer
                  renderProp={({ height, width }: { height: number | undefined; width: number | undefined }) => {
                    if (!height || !width) return null;
                    return (
                      /* @ts-ignore */
                      <List
                        key={viewMode}
                        style={{ height, width }}
                        rowCount={filteredData.length}
                        rowHeight={viewMode === 'table' ? 45 : 125}
                        rowComponent={viewMode === 'table' ? TableRow : Row}
                        rowProps={{
                          entries: filteredData,
                          onUpdateStatus: handleUpdateStatus,
                          updatingInvoice,
                          onPartyClick: (party: string) => {
                            setSelectedParty(party);
                            setActiveTab('ledger');
                          }
                        }}
                        className="scrollbar-thin scrollbar-thumb-gray-200"
                      />
                    );
                  }}
                />
              </div>
            </div>

            {filteredData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-gray-100 shadow-xl">
                  <div className="bg-gray-100 p-6 rounded-full inline-block mb-4">
                    <Filter size={48} className="text-gray-300" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">No results found</h3>
                  <div className="text-gray-500 text-sm space-y-1 mt-2">
                    {searchQuery && <p>Search: "<span className="font-bold">{searchQuery}</span>"</p>}
                    {pendingOnly && <p className="text-amber-600 font-bold uppercase text-[10px]">Filter: UNPAID Pending BILL ONLY</p>}
                    {(filterMonth || dateRange.start || dateRange.end) && <p className="text-primary-600 font-bold uppercase text-[10px]">Filter: DATE RANGE ACTIVE</p>}
                    <p className="mt-4 text-[10px] text-gray-400">Current Year: <span className="font-black">FY {selectedYear}</span></p>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setPendingOnly(false);
                        setFilterMonth('');
                        setDateRange({ start: '', end: '' });
                      }}
                      className="mt-4 pointer-events-auto bg-primary-50 text-primary-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary-100"
                    >
                      RESET ALL FILTERS
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : activeTab === 'reports' ? (
          <ReportsView
            data={data}
            onPartyClick={(party) => {
              setSelectedParty(party);
              setActiveTab('ledger');
            }}
            onNarrationClick={(narration) => {
              setSelectedNarration(narration);
              setActiveTab('narration');
            }}
            onAgeingClick={(group) => {
              setSelectedAgeingGroup(group);
              setActiveTab('ageing');
            }}
          />
        ) : activeTab === 'ledger' ? (
          <LedgerView
            data={data}
            selectedParty={selectedParty}
            setSelectedParty={setSelectedParty}
          />
        ) : activeTab === 'narration' ? (
          <NarrationView
            data={data}
            selectedNarration={selectedNarration}
            setSelectedNarration={setSelectedNarration}
            onPartyClick={(party) => {
              setSelectedParty(party);
              setActiveTab('ledger');
            }}
          />
        ) : activeTab === 'ageing' ? (
          <AgeingView
            data={data}
            selectedGroup={selectedAgeingGroup}
            onPartyClick={(party) => {
              setSelectedParty(party);
              setActiveTab('ledger');
            }}
          />
        ) : (
          <div className="p-4 flex items-center justify-center h-full text-gray-400 font-bold">
            Select a tab to view content
          </div>
        )}
      </main>

      {/* Navigation - Bottom bar for mobile */}
      <nav className="glass border-t border-gray-200 px-2 py-2 pb-6 flex justify-around items-center flex-shrink-0">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center p-2 transition-all ${activeTab === 'dashboard' ? 'text-primary-600 scale-110' : 'text-gray-400'}`}
        >
          <LayoutDashboard size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Home</span>
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex flex-col items-center p-2 transition-all ${activeTab === 'reports' ? 'text-primary-600 scale-110' : 'text-gray-400'}`}
        >
          <BarChart3 size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Reports</span>
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex flex-col items-center p-2 transition-all ${activeTab === 'ledger' ? 'text-primary-600 scale-110' : 'text-gray-400'}`}
        >
          <BookOpen size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Ledger</span>
        </button>
        <button
          onClick={() => setActiveTab('narration')}
          className={`flex flex-col items-center p-2 transition-all ${activeTab === 'narration' ? 'text-primary-600 scale-110' : 'text-gray-400'}`}
        >
          <Tags size={24} />
          <span className="text-[10px] font-bold mt-1 uppercase">Narration</span>
        </button>
      </nav>
    </div>
  );
};


// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-center">
          <h1 className="text-xl font-bold text-red-600">Something went wrong</h1>
          <pre className="text-xs mt-4 p-4 bg-gray-100 rounded overflow-auto max-h-40">{this.state.error?.message}</pre>
          <button onClick={() => window.location.reload()} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;
