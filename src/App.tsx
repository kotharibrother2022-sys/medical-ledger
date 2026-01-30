import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { SpeedInsights } from "@vercel/speed-insights/react"
import { fetchLedgerData, type LedgerEntry, type FinancialYear, YEAR_GIDS, CACHE_VERSION } from './services/sheetService';
import { List, type RowComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import {
  Search,
  RefreshCcw,
  Calendar,
  Phone,
  IndianRupee,
  Clock,
  LayoutDashboard,
  Filter,
  BarChart3,
  Users,
  FileText,
  ChevronRight,
  Filter as FilterIcon,
  CalendarDays,
  Check,
  BookOpen,
  FileDown,
  Tags
} from 'lucide-react';
import { format, parse } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface RowData {
  data: LedgerEntry[];
}

const Row = ({ index, style, data }: RowComponentProps<RowData>) => {
  const entry = data[index];
  if (!entry) return null;
  const status = (entry.narration || '').toLowerCase();
  const isSettled = status === 'received' || status === 'cancel' || status === 'credit note' || status === 'delete';
  const isOverdue = entry.dueDays > 30 && !isSettled;
  const isReceived = status === 'received';
  const isCancelled = status === 'cancel' || status === 'credit note' || status === 'delete';

  const colourLower = (entry.colour || '').toLowerCase();
  const getCardStyle = () => {
    if (isReceived) return 'border-green-200 bg-green-50/40';
    if (isCancelled) return 'border-gray-200 bg-gray-50/30 grayscale opacity-70';
    if (colourLower.includes('yellow')) return 'border-amber-400 bg-amber-50 shadow-sm ring-1 ring-amber-200/50';
    if (colourLower.includes('red')) return 'border-red-400 bg-red-50 shadow-sm ring-1 ring-red-200/50';
    if (colourLower.includes('blue')) return 'border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-200/50';
    if (colourLower.includes('green')) return 'border-green-400 bg-green-50 shadow-sm ring-1 ring-green-200/50';
    if (isOverdue) return 'border-red-200 bg-red-50/30';
    return 'border-blue-100 bg-white/50';
  };

  return (
    <div style={style} className="px-4 py-2">
      <div className={`glass rounded-xl p-4 transition-all hover:scale-[1.01] active:scale-95 ${getCardStyle()}`}>
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded leading-none uppercase tracking-tighter">
                {entry.invoiceNo}
              </span>
              {(entry.comment || entry.colour) && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span className="text-[9px] font-bold text-red-600 uppercase truncate max-w-[150px]">
                    {[entry.comment, entry.colour].filter(Boolean).join(' | ')}
                  </span>
                </div>
              )}
            </div>
            <h3 className="font-bold text-gray-800 line-clamp-1">{entry.party}</h3>
          </div>
          <div className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ml-2 ${isReceived ? 'bg-green-100 text-green-700' :
            isCancelled ? 'bg-gray-100 text-gray-700' :
              isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
            {entry.narration || 'PENDING'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm mt-2">
          <div className="flex items-center text-gray-700">
            <div className="bg-white/50 p-1 rounded mr-2"><IndianRupee size={12} className="text-primary-600" /></div>
            <span className="font-bold whitespace-nowrap">₹{(entry.amount || 0).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center text-gray-600 justify-end">
            <Calendar size={14} className="mr-1" />
            <span className="text-xs">{entry.date}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <div className={`p-1 rounded mr-2 ${isOverdue ? 'bg-red-100' : 'bg-white/50'}`}>
              <Clock size={12} className={isOverdue ? 'text-red-600' : 'text-gray-400'} />
            </div>
            <span className={`text-xs font-bold ${isOverdue ? 'text-red-600' : ''}`}>{entry.dueDays} Days</span>
          </div>

          <div className="flex items-center justify-end gap-2 col-span-2 mt-1 pt-1 border-t border-gray-100">
            {entry.mobileNo ? (
              <div className="flex gap-3">
                <a
                  href={`tel:${entry.mobileNo}`}
                  className="w-8 h-8 flex items-center justify-center text-white bg-green-500 hover:bg-green-600 rounded-full transition-all shadow-sm hover:shadow active:scale-90"
                  onClick={(e) => e.stopPropagation()}
                  title="Call Party"
                >
                  <Phone size={14} className="fill-current" />
                </a>
                <a
                  href={`https://wa.me/91${entry.mobileNo.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                    `Hello ${entry.party}, your payment of ₹${(entry.amount || 0).toLocaleString('en-IN')} for Bill ${entry.invoiceNo} dated ${entry.date} is pending (${entry.dueDays} days overdue). Please clear it at the earliest. - Kothari Brothers`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center text-white bg-[#25D366] hover:bg-[#128C7E] rounded-full transition-all shadow-sm hover:shadow active:scale-90"
                  onClick={(e) => e.stopPropagation()}
                  title="Send WhatsApp"
                >
                  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[#25D366]">W</span>
                  </div>
                </a>
              </div>
            ) : (
              <div className="flex items-center text-gray-400 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 opacity-50">
                <Phone size={12} className="mr-1" />
                <span className="text-[10px] font-bold">N/A</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Separator Line */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center opacity-30">
        <div className="w-[90%] border-b-2 border-dashed border-gray-300"></div>
      </div>
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
  const [narrationFilter, setNarrationFilter] = useState('');

  const exportToPDF = () => {
    if (!selectedParty || partyLedger.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235); // primary-600
    doc.text('KOTHARI BROTHERS', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('A PHARMACEUTICAL DEALERS', pageWidth / 2, 26, { align: 'center' });

    // 2. Party Details
    doc.line(20, 35, pageWidth - 20, 35); // Separator

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`Party: ${selectedParty.toUpperCase()}`, 20, 45);

    doc.setFontSize(10);
    doc.text(`Report Date: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 20, 52);
    doc.text(`Filter: ${showDueOnly ? 'Pending Bills Only' : 'All Transactions'}`, 20, 57);

    // 3. Table
    const tableData = partyLedger.map(entry => [
      entry.date,
      entry.invoiceNo,
      entry.narration || '-',
      `Rs. ${(entry.amount || 0).toLocaleString('en-IN')}`
    ]);

    autoTable(doc, {
      startY: 65,
      head: [['Date', 'Invoice No', 'Narration', 'Amount']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        3: { halign: 'right' }
      }
    });

    // 4. Totals summary
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL BALANCE DUE: Rs. ${totals.totalDue.toLocaleString('en-IN')}`, pageWidth - 20, finalY, { align: 'right' });

    // Footer
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

      // 2. Narration Match
      if (narrationFilter) {
        if (!entry.narration?.toLowerCase().includes(narrationFilter.toLowerCase())) return false;
      }

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
  }, [data, selectedParty, narrationFilter, showDueOnly]);

  // Calculate Totals
  const totals = useMemo(() => {
    let totalAmount = 0;
    let totalDue = 0;
    let totalPaid = 0;

    partyLedger.forEach(entry => {
      totalAmount += (entry.amount || 0);

      const status = (entry.narration || '').toLowerCase();
      const isSettled = status.includes('received') || status.includes('cancel') || status.includes('delete');

      if (!isSettled) {
        totalDue += (entry.amount || 0);
      } else {
        totalPaid += (entry.amount || 0); // Assuming received amounts are strictly payments (simplification)
        // Ideally "Paid" might be explicit. For now, we just sum up the list.
      }
    });
    return { totalAmount, totalDue, totalPaid };
  }, [partyLedger]);

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Filters Header */}
      <div className="p-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-gray-100 space-y-4">

        {/* Party Selector */}
        <div className="flex justify-between items-end gap-2">
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Select Party</label>
            <input
              list="parties"
              placeholder="Type Party Name..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-primary-500"
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
            />
            <datalist id="parties">
              {parties.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          {selectedParty && partyLedger.length > 0 && (
            <button
              onClick={exportToPDF}
              className="bg-primary-600 text-white p-3 rounded-xl shadow-lg shadow-primary-200 active:scale-90 transition-all flex items-center justify-center"
              title="Download PDF"
            >
              <FileDown size={20} />
            </button>
          )}
        </div>

        {selectedParty && (
          <div className="flex gap-4 items-center">
            {/* Due Only Toggle */}
            <button
              onClick={() => setShowDueOnly(!showDueOnly)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed transition-all active:scale-95 ${showDueOnly
                ? 'bg-red-50 border-red-200 text-red-600'
                : 'bg-white border-gray-300 text-gray-400'
                }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${showDueOnly ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                {showDueOnly && <Check size={10} className="text-white" />}
              </div>
              <span className="text-xs font-bold uppercase">Show Dues Only</span>
            </button>

            {/* Narration Filter */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Filter Narration..."
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-primary-500"
                value={narrationFilter}
                onChange={(e) => setNarrationFilter(e.target.value)}
              />
            </div>
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
            <div key={idx} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
              {/* Date */}
              <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl px-2 py-1 min-w-[50px]">
                <span className="text-[10px] font-bold text-gray-400 uppercase">{format(parse(entry.date.replace(/-/g, '/').replace(/\./g, '/'), 'dd/MM/yyyy', new Date()), 'MMM')}</span>
                <span className="text-lg font-black text-gray-800">{format(parse(entry.date.replace(/-/g, '/').replace(/\./g, '/'), 'dd/MM/yyyy', new Date()), 'dd')}</span>
                <span className="text-[10px] font-bold text-gray-300">{format(parse(entry.date.replace(/-/g, '/').replace(/\./g, '/'), 'dd/MM/yyyy', new Date()), 'yy')}</span>
              </div>

              {/* Main Details */}
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Invoice: {entry.invoiceNo}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-gray-800">₹{(entry.amount || 0).toLocaleString('en-IN')}</span>
                      {/* Status Badge */}
                      {entry.narration && (
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase ${entry.narration.toLowerCase().includes('received') ? 'bg-green-100 text-green-700' :
                          entry.narration.toLowerCase().includes('cancel') ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                          {entry.narration}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Interaction Buttons */}
                  <div className="flex gap-2">
                    {entry.mobileNo ? (
                      <>
                        <a
                          href={`tel:${entry.mobileNo}`}
                          className="w-8 h-8 flex items-center justify-center text-white bg-green-500 rounded-full shadow-sm active:scale-90"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone size={14} className="fill-current" />
                        </a>
                        <a
                          href={`https://wa.me/91${entry.mobileNo.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                            `Hello ${entry.party}, your payment of ₹${(entry.amount || 0).toLocaleString('en-IN')} for Bill ${entry.invoiceNo} dated ${entry.date} is pending. Please clear it. - Kothari Brothers`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 flex items-center justify-center text-white bg-[#25D366] rounded-full shadow-sm active:scale-90"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                            <span className="text-[10px] font-bold text-[#25D366]">W</span>
                          </div>
                        </a>
                      </>
                    ) : (
                      <div className="w-8 h-8 flex items-center justify-center text-gray-300 bg-gray-50 rounded-full border border-gray-100 opacity-50">
                        <Phone size={12} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Summary Footer */}
      {selectedParty && partyLedger.length > 0 && (
        <div className="absolute bottom-20 left-4 right-4 bg-gray-900 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center z-20">
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase">Total Balance</p>
            <p className="text-xl font-black text-white">₹{totals.totalDue.toLocaleString('en-IN')}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 font-bold uppercase">{partyLedger.length} Entries</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Reports View Component
const ReportsView = ({
  data,
  onPartyClick
}: {
  data: LedgerEntry[],
  onPartyClick: (party: string) => void
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
      const nar = entry.narration || 'PENDING';
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
            <div key={label} className="glass p-4 rounded-2xl border-l-4 border-primary-400">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{label}</p>
              <p className="text-lg font-black text-gray-900">₹{(amount / 1000).toFixed(1)}K</p>
            </div>
          ))}
        </div>
      </section>

      {/* Narration-wise Pending */}
      <section>
        <div className="flex items-center mb-4">
          <FileText className="text-primary-600 mr-2" size={20} />
          <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider">Narration-wise Pending</h2>
        </div>
        <div className="glass rounded-2xl overflow-hidden border border-gray-100">
          {narrationGroups.map(([narration, amount]) => (
            <div key={narration} className={`flex justify-between items-center p-4 border-b border-gray-50 last:border-0`}>
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

                {/* Interaction Row in Report */}
                <div className="flex gap-2">
                  {stats.mobileNo ? (
                    <>
                      <a
                        href={`tel:${stats.mobileNo}`}
                        className="w-7 h-7 flex items-center justify-center text-white bg-green-500 rounded-full active:scale-90 transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone size={12} className="fill-current" />
                      </a>
                      <a
                        href={`https://wa.me/91${stats.mobileNo.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                          `Hello ${party}, your total outstanding balance with Kothari Brothers is ₹${(stats.amount || 0).toLocaleString('en-IN')} across ${stats.bills} bills. Please clear it at the earliest.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 flex items-center justify-center text-white bg-[#25D366] rounded-full active:scale-90 transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center">
                          <span className="text-[8px] font-bold text-[#25D366]">W</span>
                        </div>
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {partyGroups.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No pending party data</div>}
        </div>
      </section>
    </div>
  );
};

const NarrationView = ({ data }: { data: LedgerEntry[] }) => {
  const [selectedNarration, setSelectedNarration] = useState<string>('');

  // Get unique narrations, excluding payment/settled ones
  const narrations = useMemo(() => {
    const relevant = data
      .map(e => (e.narration || '').trim())
      .filter(n => {
        if (!n) return false;
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
      if (entry.narration !== selectedNarration) return false;

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
      columnStyles: {
        3: { halign: 'right' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
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
          <div className="flex-1 relative">
            <input
              list="narrations"
              placeholder="Search Narration..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-800 outline-none focus:ring-2 focus:ring-primary-500"
              value={selectedNarration}
              onChange={(e) => setSelectedNarration(e.target.value)}
            />
            <datalist id="narrations">
              {narrations.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          {selectedNarration && narrationLedger.length > 0 && (
            <button
              onClick={exportToPDF}
              className="bg-indigo-600 text-white p-3 rounded-xl shadow-lg shadow-indigo-200 active:scale-90 transition-all flex items-center justify-center"
            >
              <FileDown size={20} />
            </button>
          )}
        </div>
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
            <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xs font-black text-primary-600 uppercase tracking-tight">{entry.party}</h3>
                  <p className="text-[10px] font-bold text-gray-400">Invoice: {entry.invoiceNo} • {entry.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-900">₹{(entry.amount || 0).toLocaleString('en-IN')}</p>
                  <span className="text-[8px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-black uppercase">DUE</span>
                </div>
              </div>

              {/* Interaction Row */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                <div className="flex items-center text-[10px] text-gray-400 font-bold uppercase">
                  <Clock size={10} className="mr-1" />
                  {entry.dueDays} Days Overdue
                </div>

                <div className="flex gap-2">
                  {entry.mobileNo ? (
                    <>
                      <a
                        href={`tel:${entry.mobileNo}`}
                        className="w-8 h-8 flex items-center justify-center text-white bg-green-500 rounded-full shadow-sm active:scale-90 transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone size={14} className="fill-current" />
                      </a>
                      <a
                        href={`https://wa.me/91${entry.mobileNo.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                          `Hello ${entry.party}, your payment of ₹${(entry.amount || 0).toLocaleString('en-IN')} for Bill ${entry.invoiceNo} dated ${entry.date} is pending. Please clear it. - Kothari Brothers`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 flex items-center justify-center text-white bg-[#25D366] rounded-full shadow-sm active:scale-90 transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                          <span className="text-[10px] font-bold text-[#25D366]">W</span>
                        </div>
                      </a>
                    </>
                  ) : (
                    <span className="text-[10px] font-bold text-gray-300 italic">No Number</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedNarration && narrationLedger.length > 0 && (
        <div className="absolute bottom-20 left-4 right-4 animate-in slide-in-from-bottom-4">
          <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center">
            <div>
              <p className="text-[10px] text-indigo-200 font-bold uppercase">Total Pending Amount</p>
              <p className="text-xl font-black">₹{totals.totalAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-black">{narrationLedger.length} Bills</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DEFAULT_YEAR: FinancialYear = '25-26';

const App: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<FinancialYear>(DEFAULT_YEAR);
  const [selectedParty, setSelectedParty] = useState<string>('');

  // Lazy initialize data from localStorage to avoid "Loading..." flash
  const [data, setData] = useState<LedgerEntry[]>(() => {
    try {
      const v = localStorage.getItem('app_cache_version');
      if (v !== CACHE_VERSION) return [];

      const cached = localStorage.getItem(`cachedLedgerData_${DEFAULT_YEAR}`);
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      console.error("Failed to parse init cache", e);
      return [];
    }
  });

  const [loading, setLoading] = useState(() => {
    const v = localStorage.getItem('app_cache_version');
    if (v !== CACHE_VERSION) return true;
    // Only show loading if we didn't find data in cache
    return !localStorage.getItem(`cachedLedgerData_${DEFAULT_YEAR}`);
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'ledger' | 'narration'>('dashboard');

  const [lastUpdated, setLastUpdated] = useState<string | null>(() => {
    return localStorage.getItem(`cachedTime_${DEFAULT_YEAR}`);
  });

  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Date Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterMonth, setFilterMonth] = useState<string>(''); // 'MM-yyyy'
  const [dateRange, setDateRange] = useState<{ start: string, end: string }>({ start: '', end: '' });

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    const len = data.length;
    for (let i = 0; i < len; i++) {
      const my = data[i].monthYear;
      if (my) months.add(my);
    }
    // Sort reverse chronological
    return Array.from(months).sort((a, b) => {
      try {
        const db = parse(b, 'MMMM yyyy', new Date());
        const da = parse(a, 'MMMM yyyy', new Date());
        return db.getTime() - da.getTime();
      } catch (e) { return 0; }
    });
  }, [data]);

  // Clear stale caches on version bump
  useEffect(() => {
    const currentV = localStorage.getItem('app_cache_version');
    if (currentV !== CACHE_VERSION) {
      console.log("Cache version mismatch. Clearing old data...");
      Object.keys(localStorage).forEach(key => {
        if (key.includes('cachedLedgerData')) localStorage.removeItem(key);
      });
      localStorage.setItem('app_cache_version', CACHE_VERSION);
    }
  }, []);

  const loadData = async (year: FinancialYear = selectedYear, forceRefresh = false) => {
    try {
      const cached = localStorage.getItem(`cachedLedgerData_${year}`);
      const cachedTime = localStorage.getItem(`cachedTime_${year}`);

      // CACHE STRATEGY:
      // 1. If we have cache and NOT forced refresh -> Load cache immediately & stop.
      // 2. If we have cache AND forced refresh -> Show cache, set refreshing=true, fetch new.
      // 3. If NO cache -> Set loading=true, fetch new.

      if (cached && !forceRefresh) {
        setData(JSON.parse(cached));
        setLastUpdated(cachedTime);
        setLoading(false);
        setRefreshing(false);
        return; // STOP HERE. Do not auto-fetch.
      }

      // If we are here, we are either:
      // A) Forcing a refresh (user clicked button)
      // B) Have no cache (first time user)

      if (cached) {
        // Option A: We have data, so keep showing it, just show spinner
        setRefreshing(true);
        // Ensure data is set from cache just in case we came here directly
        if (data.length === 0) {
          setData(JSON.parse(cached));
          setLastUpdated(cachedTime);
        }
      } else {
        // Option B: No data at all, heavy loading screen
        setLoading(true);
      }

      setError(null);
      let ledgerData: LedgerEntry[] = [];
      const startTime = performance.now();

      if (year === 'ALL_TIME') {
        const years = Object.keys(YEAR_GIDS) as (keyof typeof YEAR_GIDS)[];
        setLoadingProgress('Syncing all years...');
        const results = await Promise.all(years.map(y => fetchLedgerData(y, forceRefresh)));
        ledgerData = results.flat();
      } else {
        setLoadingProgress(`Syncing ${year}...`);
        ledgerData = await fetchLedgerData(year, forceRefresh);
      }

      const processTime = performance.now() - startTime;
      console.log(`Data fetch & process took ${processTime.toFixed(2)}ms for ${ledgerData.length} rows`);

      setData(ledgerData);
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastUpdated(now);

      const cacheStartTime = performance.now();
      try {
        localStorage.setItem(`cachedLedgerData_${year}`, JSON.stringify(ledgerData));
        localStorage.setItem(`cachedTime_${year}`, now);
        localStorage.setItem(`cachedTimestamp_${year}`, Date.now().toString());
        localStorage.setItem('app_cache_version', CACHE_VERSION);
        console.log(`Caching took ${(performance.now() - cacheStartTime).toFixed(2)}ms`);
      } catch (e) {
        console.warn("Failed to cache data (likely too large for localStorage)", e);
      }

      setError(null);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setError('Failed to sync. Showing last saved data.');
      // If fetch fails, we might still have cache, which is already set.
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingProgress('');
    }
  };

  useEffect(() => {
    loadData(selectedYear);
    document.title = "KOTHARI BROTHERS";
  }, [selectedYear]);

  const deferredSearch = useDeferredValue(searchQuery);

  const { filteredData, metrics } = useMemo(() => {
    const searchWords = deferredSearch.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 0);
    const hasSearch = searchWords.length > 0;

    // Pre-calculate date filter bounds
    // SAFELY handle date parsing to prevent crashes
    let startBound: number | null = null;
    let endBoundTime: number | null = null;

    try {
      if (dateRange.start) {
        const s = new Date(dateRange.start);
        if (!isNaN(s.getTime())) {
          s.setHours(0, 0, 0, 0);
          startBound = s.getTime();
        }
      }

      if (dateRange.end) {
        const e = new Date(dateRange.end);
        if (!isNaN(e.getTime())) {
          e.setHours(23, 59, 59, 999);
          endBoundTime = e.getTime();
        }
      }
    } catch (e) {
      console.error("Date filter processing error", e);
    }

    const results: LedgerEntry[] = [];
    let totOutstanding = 0;
    let ovrCount = 0;

    // SINGLE PASS LOOP
    const len = data.length;
    for (let i = 0; i < len; i++) {
      const entry = data[i];

      // 1. SEARCH FILTER
      if (hasSearch) {
        let matchesAll = true;
        for (let j = 0; j < searchWords.length; j++) {
          if (!entry.searchString.includes(searchWords[j])) {
            matchesAll = false;
            break;
          }
        }
        if (!matchesAll) continue;
      }

      // 2. DATE FILTER
      if (showFilters) {
        if (filterMonth && entry.monthYear !== filterMonth) continue;
        if (startBound !== null && entry.timestamp < startBound) continue;
        if (endBoundTime !== null && entry.timestamp > endBoundTime) continue;
      }

      // 3. STATUS LOGIC (Calculated once per loop)
      const status = (entry.narration || '').toLowerCase();
      const isSettled = status === 'received' || status === 'cancel' || status === 'credit note' || status === 'delete';

      // 4. PENDING ONLY FILTER
      if (pendingOnly && isSettled) continue;

      // MATCH!
      results.push(entry);

      // 5. ACCUMULATE METRICS
      if (!isSettled) {
        totOutstanding += entry.amount;
        if (entry.dueDays > 30) {
          ovrCount++;
        }
      }
    }

    return {
      filteredData: results,
      metrics: { totalOutstanding: totOutstanding, overdueCount: ovrCount }
    };
  }, [data, deferredSearch, pendingOnly, showFilters, filterMonth, dateRange]);

  const { totalOutstanding, overdueCount } = metrics;

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
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">KOTHARI <span className="text-primary-600">BROTHERS</span></h1>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mt-0.5 whitespace-nowrap">A PHARMACEUTICAL DEALERS</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value as FinancialYear)}
              className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
            >
              {Object.keys(YEAR_GIDS).map(year => (
                <option key={year} value={year}>FY {year}</option>
              ))}
            </select>
            <div className="flex flex-col items-end">
              <button
                onClick={() => loadData(selectedYear, true)}
                className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${refreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCcw size={20} className="text-gray-600" />
              </button>
              {lastUpdated && !refreshing && (
                <span className="text-[8px] font-bold text-gray-400 -mt-1 uppercase">Synced {lastUpdated}</span>
              )}
              {refreshing && (
                <span className="text-[8px] font-bold text-primary-500 -mt-1 uppercase animate-pulse">
                  {loadingProgress || 'Syncing...'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex gap-2">
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
          <button
            onClick={() => setPendingOnly(!pendingOnly)}
            className={`px-4 rounded-2xl border transition-all flex items-center gap-2 font-bold text-sm ${pendingOnly
              ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-200'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
          >
            <Clock size={18} />
            <span className="hidden sm:inline">{pendingOnly ? 'Pending' : 'All'}</span>
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 rounded-2xl border transition-all flex items-center gap-2 font-bold text-sm ${showFilters
              ? 'bg-primary-500 border-primary-500 text-white shadow-lg shadow-primary-200'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
          >
            <FilterIcon size={18} />
          </button>
        </div>

        {/* Date Filters Panel */}
        {showFilters && (
          <div className="mt-3 p-4 glass rounded-2xl border border-gray-100 animate-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                <CalendarDays size={16} className="text-primary-600" />
                Date Filters
              </h3>
              <button onClick={() => {
                setFilterMonth('');
                setDateRange({ start: '', end: '' });
              }} className="text-[10px] font-bold text-red-500 uppercase hover:underline">
                Clear Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Month Select */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Select Month</label>
                <select
                  value={filterMonth}
                  onChange={(e) => {
                    setFilterMonth(e.target.value);
                    setDateRange({ start: '', end: '' }); // Clear range if month selected
                  }}
                  className="w-full bg-white/50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All Months</option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => {
                      setDateRange(prev => ({ ...prev, start: e.target.value }));
                      setFilterMonth(''); // Clear month if range used
                    }}
                    className="w-full bg-white/50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">End Date</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => {
                      setDateRange(prev => ({ ...prev, end: e.target.value }));
                      setFilterMonth(''); // Clear month if range used
                    }}
                    className="w-full bg-white/50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <p className="text-xs font-bold text-red-700">{error}</p>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'dashboard' ? (
          <>
            {/* Dashboard Summary Cards */}
            <div className="flex gap-4 p-4 overflow-x-auto no-scrollbar">
              <div className="flex-shrink-0 w-40 glass p-4 rounded-2xl border-l-4 border-primary-500 shadow-sm">
                <p className="text-[10px] font-bold text-gray-800 uppercase tracking-wider mb-1">Total Due</p>
                <p className="text-lg font-black text-primary-700">₹{(totalOutstanding / 100000).toFixed(2)}L</p>
              </div>
              <div className="flex-shrink-0 w-40 glass p-4 rounded-2xl border-l-4 border-red-500 shadow-sm">
                <p className="text-[10px] font-bold text-gray-800 uppercase tracking-wider mb-1">Overdue (30+)</p>
                <p className="text-lg font-black text-red-700">{overdueCount}</p>
              </div>
              <div className="flex-shrink-0 w-40 glass p-4 rounded-2xl border-l-4 border-green-500 shadow-sm">
                <p className="text-[10px] font-bold text-gray-800 uppercase tracking-wider mb-1">Matching</p>
                <p className="text-lg font-black text-green-700">{filteredData.length}</p>
              </div>
            </div>

            <div className="flex-1 h-full pb-32">
              <AutoSizer renderProp={({ height, width }) => (
                <List
                  rowCount={filteredData.length}
                  rowHeight={165}
                  className="no-scrollbar"
                  rowComponent={Row}
                  rowProps={{ data: filteredData }}
                  style={{ height, width }}
                />
              )} />
            </div>

            {filteredData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center p-8">
                  <div className="bg-gray-100 p-6 rounded-full inline-block mb-4">
                    <Filter size={48} className="text-gray-300" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">No results found</h3>
                  <p className="text-gray-500">Try changing your search keywords</p>
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
          />
        ) : activeTab === 'ledger' ? (
          <LedgerView
            data={data}
            selectedParty={selectedParty}
            setSelectedParty={setSelectedParty}
          />
        ) : activeTab === 'narration' ? (
          <NarrationView data={data} />
        ) : (
          <div className="p-4 space-y-3">
            <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-4 px-2">Main Menu</h2>
            {['Sync Settings', 'Export Data', 'Help & Support', 'About LedgerPro'].map((item) => (
              <div key={item} className="glass p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all">
                <span className="font-bold text-gray-700">{item}</span>
                <ChevronRight size={18} className="text-gray-400" />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Navigation - Bottom bar for mobile */}
      <nav className="glass border-t border-gray-200 px-6 py-2 pb-6 flex justify-between items-center">
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
      <SpeedInsights />
    </div>
  );
};

export default App;
