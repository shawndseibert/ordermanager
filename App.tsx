
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Download, 
  FileSpreadsheet, 
  Loader2, 
  Plus, 
  Info, 
  Search, 
  AlertCircle, 
  Trash2, 
  FileUp, 
  FilterX, 
  BarChart3, 
  BrainCircuit, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  RotateCcw, 
  X, 
  Layers, 
  History as HistoryIcon,
  Activity,
  Zap,
  CalendarDays,
  Gauge,
  PieChart,
  Target,
  FileText,
  ShieldAlert,
  Filter
} from 'lucide-react';
import { Order, PendingImport } from './types';
import { extractOrdersFromFile, getAIOrderInsights } from './services/geminiService';
import OrderRow from './components/OrderRow';
import { isOrderLate, parsePOSDate, getDaysDiff } from './utils/dateUtils';

const STORAGE_KEY = 'nova_orders_master_v3';
const HISTORY_KEY = 'nova_orders_history';
const FILE_LOG_KEY = 'nova_processed_files';

type FilterType = 'all' | 'pending' | 'late';

const App: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [deleteHistory, setDeleteHistory] = useState<Order[]>([]);
  const [processedFileNames, setProcessedFileNames] = useState<string[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [aiInsights, setAiInsights] = useState<{ summary: string, insights: {title: string, content: string, type: string}[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'info' | 'error' } | null>(null);
  
  const toggleFilter = (filter: FilterType) => {
    setActiveFilter(prev => prev === filter ? 'all' : filter);
  };

  const [pendingImports, setPendingImports] = useState<PendingImport[]>([]);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeInfo, setActiveInfo] = useState<{ title: string; text: string } | null>(null);

  // Persistence management
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedHistory = localStorage.getItem(HISTORY_KEY);
    const savedFiles = localStorage.getItem(FILE_LOG_KEY);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setOrders(parsed);
      } catch (e) { console.error("Persistence load error", e); }
    }
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) setDeleteHistory(parsed);
      } catch (e) { console.error("History load error", e); }
    }
    if (savedFiles) {
      try {
        const parsed = JSON.parse(savedFiles);
        if (Array.isArray(parsed)) setProcessedFileNames(parsed);
      } catch (e) { console.error("Log load error", e); }
    }
  }, []);

  useEffect(() => {
    if (orders.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    }
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(deleteHistory));
  }, [deleteHistory]);

  useEffect(() => {
    localStorage.setItem(FILE_LOG_KEY, JSON.stringify(processedFileNames));
  }, [processedFileNames]);

  const handleFactoryReset = () => {
    if (window.confirm('Confirm Reset: This will permanently remove all order records and history from this device.')) {
      localStorage.clear();
      setOrders([]);
      setDeleteHistory([]);
      setProcessedFileNames([]);
      setAiInsights(null);
      window.location.reload();
    }
  };

  const handleMultiFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    let filesToProcess: File[] = [];

    for (const file of fileList) {
      if (processedFileNames.includes(file.name)) {
        if (!window.confirm(`File "${file.name}" has already been analyzed. Re-import?`)) continue;
      }
      filesToProcess.push(file);
    }

    if (filesToProcess.length === 0) {
      event.target.value = '';
      return;
    }

    setIsProcessing(true);
    setStatusMessage({ text: `Processing ${filesToProcess.length} document(s)...`, type: 'info' });

    let extractedQueue: Order[] = [];

    for (const file of filesToProcess) {
      setProcessedFileNames(prev => [...new Set([...prev, file.name])]);
      
      if (file.name.endsWith('.csv')) {
        const csvOrders = await handleCSVFile(file);
        extractedQueue = [...extractedQueue, ...csvOrders];
        continue;
      }

      const reader = new FileReader();
      const filePromise = new Promise<void>((resolve) => {
        reader.onload = async (e) => {
          const base64 = e.target?.result as string;
          try {
            const result = await extractOrdersFromFile(base64);
            if (result.orders && result.orders.length > 0) {
              const cleaned: Order[] = result.orders
                .filter(o => o.vendorCode || o.customerName)
                .map((o, idx) => ({
                  lineNumber: String(o.lineNumber || orders.length + extractedQueue.length + idx + 1).replace('.', ''),
                  vendorCode: String(o.vendorCode || '').trim().toUpperCase(),
                  customerName: String(o.customerName || '').trim(),
                  estNum: String(o.estNum || '').trim(),
                  orderNum: String(o.orderNum || '').trim(),
                  orderDate: String(o.orderDate || '').trim(),
                  expectedRecvDate: String(o.expectedRecvDate || '').trim(),
                  status: String(o.status || 'Ordered').trim(),
                  id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  description: '',
                }));
              extractedQueue = [...extractedQueue, ...cleaned];
            }
          } catch (err) { console.error(`Analysis Error:`, err); }
          resolve();
        };
        reader.readAsDataURL(file);
      });
      await filePromise;
    }

    resolvePendingImports(extractedQueue);
    setIsProcessing(false);
    event.target.value = '';
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const resolvePendingImports = (newBatch: Order[]) => {
    const pendings: PendingImport[] = newBatch.map(no => {
      const duplicate = orders.find(eo => 
        eo.vendorCode === no.vendorCode && 
        eo.orderNum === no.orderNum && 
        eo.customerName === no.customerName
      );
      return { newOrder: no, isDuplicate: !!duplicate, existingId: duplicate?.id };
    });

    const directAdds = pendings.filter(p => !p.isDuplicate).map(p => p.newOrder);
    const duplicates = pendings.filter(p => p.isDuplicate);

    if (directAdds.length > 0) setOrders(prev => [...prev, ...directAdds]);

    if (duplicates.length > 0) {
      setPendingImports(duplicates);
      setIsDuplicateModalOpen(true);
    } else if (directAdds.length > 0) {
      setStatusMessage({ text: `Import successful. ${directAdds.length} records added.`, type: 'info' });
    }
  };

  const handleDuplicateDecision = (decision: 'keep' | 'skip') => {
    if (decision === 'keep') {
      setOrders(prev => [...prev, ...pendingImports.map(p => p.newOrder)]);
    }
    setPendingImports([]);
    setIsDuplicateModalOpen(false);
  };

  const handleCSVFile = async (file: File): Promise<Order[]> => {
    const text = await file.text();
    const rows = text.split('\n').map(r => r.split(',').map(c => c.replace(/^"|"$/g, '').trim()));
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.toLowerCase());
    const dataRows = rows.slice(1);
    const getIdx = (name: string) => headers.findIndex(h => h.includes(name));
    const idxVendor = getIdx('vendor'), idxCustomer = getIdx('customer'), idxDesc = getIdx('detail'), idxEst = getIdx('est'), idxPO = getIdx('po'), idxDate = getIdx('date'), idxExpect = getIdx('expect'), idxStatus = getIdx('status');

    return dataRows
      .filter(row => row.length > 1 && (row[idxVendor] || row[idxCustomer]))
      .map(row => ({
        lineNumber: '',
        vendorCode: (row[idxVendor] || '').toUpperCase(),
        customerName: row[idxCustomer] || '',
        description: row[idxDesc] || '',
        estNum: row[idxEst] || '',
        orderNum: row[idxPO] || '',
        orderDate: row[idxDate] || '',
        expectedRecvDate: row[idxExpect] || '',
        status: row[idxStatus] || 'Ordered',
        id: `csv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));
  };

  const deleteOrder = (id: string) => {
    const orderToDelete = orders.find(o => o.id === id);
    if (!orderToDelete) return;
    setDeleteHistory(prev => [orderToDelete, ...prev].slice(0, 50));
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  const restoreHistoryItem = (order: Order) => {
    setOrders(prev => [order, ...prev]);
    setDeleteHistory(prev => prev.filter(h => h.id !== order.id));
  };

  const exportToCSV = () => {
    if (orders.length === 0) return;
    const headers = ['Vendor', 'Customer', 'Details', 'Est#', 'PO#', 'Date Ordered', 'Expected', 'Status'];
    const rows = orders.map(o => [o.vendorCode, o.customerName, o.description, o.estNum, o.orderNum, o.orderDate, o.expectedRecvDate, o.status]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Registry_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const generateInsights = async () => {
    if (orders.length === 0) return;
    setIsGeneratingInsights(true);
    setAiInsights(null); 
    try {
      const result = await getAIOrderInsights(orders);
      setAiInsights(result);
    } catch (err) { 
      console.error(err);
      setStatusMessage({ text: "AI Reporting failed. Please try again.", type: "error" });
    } finally { 
      setIsGeneratingInsights(false); 
    }
  };

  const uniqueVendors = useMemo(() => {
    const vendors = orders.map(o => o.vendorCode).filter(Boolean);
    return Array.from(new Set(vendors)).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => orders.filter(o => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (o.customerName || '').toLowerCase().includes(q) || (o.vendorCode || '').toLowerCase().includes(q) || (o.orderNum || '').includes(q) || (o.description || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    
    if (selectedVendor !== 'all' && o.vendorCode !== selectedVendor) return false;

    if (activeFilter === 'pending') {
      const s = (o.status || '').toLowerCase();
      return !s.includes('received') && !s.includes("recv'd");
    }
    if (activeFilter === 'late') return isOrderLate(o.status, o.expectedRecvDate);
    return true;
  }), [orders, searchQuery, selectedVendor, activeFilter]);

  // ANALYTICS COMPUTATION
  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter(o => {
      const s = (o.status || '').toLowerCase();
      return !s.includes('received') && !s.includes("recv'd");
    }).length;
    const late = orders.filter(o => isOrderLate(o.status, o.expectedRecvDate)).length;
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const lateOrders = orders.filter(o => isOrderLate(o.status, o.expectedRecvDate));
    const totalAgingDays = lateOrders.reduce((sum, o) => {
      const expected = parsePOSDate(o.expectedRecvDate);
      return expected ? sum + getDaysDiff(expected, today) : sum;
    }, 0);
    const avgAging = lateOrders.length > 0 ? Math.round(totalAgingDays / lateOrders.length) : 0;

    const validLeadTimes = orders.map(o => {
      const start = parsePOSDate(o.orderDate);
      const end = parsePOSDate(o.expectedRecvDate);
      return (start && end) ? getDaysDiff(start, end) : null;
    }).filter(v => v !== null) as number[];
    const avgLeadTime = validLeadTimes.length > 0 ? Math.round(validLeadTimes.reduce((a,b) => a+b, 0) / validLeadTimes.length) : 0;
    
    const fulfilledCount = total - pending;
    const fulfillmentRate = total > 0 ? Math.round((fulfilledCount / total) * 100) : 0;

    return { total, pending, late, avgAging, avgLeadTime, fulfillmentRate };
  }, [orders]);

  const vendorChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => { counts[o.vendorCode] = (counts[o.vendorCode] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  const monthlyVolumeData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      const d = parsePOSDate(o.orderDate);
      if (d) {
        const key = months[d.getMonth()];
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return months.map(m => ({ label: m, value: counts[m] || 0 }));
  }, [orders]);

  const agingTiers = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const buckets = { '1-7d': 0, '8-14d': 0, '15-30d': 0, '30d+': 0 };
    orders.filter(o => isOrderLate(o.status, o.expectedRecvDate)).forEach(o => {
      const expected = parsePOSDate(o.expectedRecvDate);
      if (expected) {
        const diff = getDaysDiff(expected, today);
        if (diff <= 7) buckets['1-7d']++;
        else if (diff <= 14) buckets['8-14d']++;
        else if (diff <= 30) buckets['15-30d']++;
        else buckets['30d+']++;
      }
    });
    return Object.entries(buckets);
  }, [orders]);

  const statusDistData = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      const s = o.status.toLowerCase();
      let key = 'Pending';
      if (s.includes('received') || s.includes("recv'd")) key = 'Fulfilled';
      else if (s.includes('back') || s.includes('delay')) key = 'Exceptions';
      else if (s.includes('transit') || s.includes('ship')) key = 'In Transit';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b) => b[1] - a[1]);
  }, [orders]);

  const dayOfWeekData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      const d = parsePOSDate(o.orderDate);
      if (d) {
        const day = days[d.getDay()];
        counts[day] = (counts[day] || 0) + 1;
      }
    });
    return days.map(d => ({ label: d, value: counts[d] || 0 }));
  }, [orders]);

  const vendorLeadTimes = useMemo(() => {
    const data: Record<string, { total: number, count: number }> = {};
    orders.forEach(o => {
      const start = parsePOSDate(o.orderDate);
      const end = parsePOSDate(o.expectedRecvDate);
      if (start && end) {
        const diff = getDaysDiff(start, end);
        if (!data[o.vendorCode]) data[o.vendorCode] = { total: 0, count: 0 };
        data[o.vendorCode].total += diff;
        data[o.vendorCode].count += 1;
      }
    });
    return Object.entries(data)
      .map(([vendor, vals]) => ({ vendor, avg: Math.round(vals.total / vals.count) }))
      .sort((a,b) => a.avg - b.avg)
      .slice(0, 5);
  }, [orders]);

  return (
    <div className="min-h-screen flex flex-col bg-[#080808] text-neutral-300">
      
      {/* INFO DIALOG */}
      {activeInfo && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-8 relative">
            <button onClick={() => setActiveInfo(null)} className="absolute top-4 right-4 text-neutral-500 hover:text-white"><X size={20} /></button>
            <h3 className="text-xl font-bold text-white mb-4 uppercase tracking-tight">{activeInfo.title}</h3>
            <p className="text-sm text-neutral-400 leading-relaxed">{activeInfo.text}</p>
            <button onClick={() => setActiveInfo(null)} className="mt-8 w-full py-3 bg-neutral-800 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-neutral-700 transition-colors">Dismiss</button>
          </div>
        </div>
      )}

      {/* MODALS */}
      {isDuplicateModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
          <div className="bg-[#121212] border border-neutral-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500"><ShieldAlert size={24} /></div>
              <div><h2 className="text-xl font-bold text-white tracking-tight">Duplicate Records</h2><p className="text-xs text-neutral-500 mt-1">{pendingImports.length} existing entries detected.</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleDuplicateDecision('skip')} className="px-6 py-4 bg-neutral-900 text-neutral-400 rounded-xl font-bold text-xs uppercase tracking-wider border border-neutral-800 hover:text-white">Ignore</button>
              <button onClick={() => handleDuplicateDecision('keep')} className="px-6 py-4 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg">Import All</button>
            </div>
          </div>
        </div>
      )}

      {isHistoryOpen && (
        <div className="fixed inset-0 z-[250] flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0a0a0a] h-full border-l border-neutral-800 shadow-2xl flex flex-col p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Archived Items</h2>
              <button onClick={() => setIsHistoryOpen(false)} className="text-neutral-500"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
              {deleteHistory.length === 0 ? <p className="text-neutral-700 text-center py-20 text-xs uppercase tracking-widest">No archived records</p> : 
                deleteHistory.map(item => (
                  <div key={item.id} className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl flex justify-between items-center">
                    <div><p className="text-sm font-bold text-neutral-200">{item.customerName}</p><p className="text-[10px] text-neutral-600 font-mono">PO#{item.orderNum}</p></div>
                    <button onClick={() => restoreHistoryItem(item)} className="p-2 bg-indigo-600 text-white rounded-lg"><RotateCcw size={14} /></button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <nav className="sticky top-0 z-[100] bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-neutral-900 px-4 md:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
        <h1 className="text-2xl font-bold tracking-tight text-white uppercase">Order Manager</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative group flex-1 sm:w-48 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-indigo-400" size={14} />
            <input type="text" placeholder="Search registry..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-neutral-700" />
          </div>
          
          <div className="relative w-32 lg:w-40">
             <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" size={14} />
             <select 
              value={selectedVendor} 
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="w-full pl-9 pr-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-xl text-[10px] font-bold uppercase outline-none focus:ring-1 focus:ring-indigo-500/50 appearance-none text-neutral-400"
             >
               <option value="all">All Vendors</option>
               {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
             </select>
          </div>

          <label className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-neutral-800 transition-all active:scale-95 ${isProcessing ? 'bg-neutral-800 animate-pulse' : 'bg-neutral-900 hover:bg-neutral-800 cursor-pointer shadow-sm hover:border-neutral-700'}`}>
            {isProcessing ? <Loader2 size={16} className="animate-spin text-indigo-400" /> : <FileUp size={16} className="text-indigo-500" />}
            <span className="text-xs font-bold text-neutral-300 tracking-wide uppercase hidden lg:inline">{isProcessing ? 'Processing...' : 'Import Scans'}</span>
            {!isProcessing && <input type="file" className="hidden" accept="image/*,.pdf,.csv" multiple onChange={handleMultiFileUpload} />}
          </label>
          <button onClick={() => setIsHistoryOpen(true)} className="p-3 bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white rounded-xl transition-all relative">
            <HistoryIcon size={18} />
            {deleteHistory.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white text-[8px] flex items-center justify-center rounded-full font-bold">{deleteHistory.length}</span>}
          </button>
          <button onClick={exportToCSV} disabled={orders.length === 0} className="p-3 bg-white text-black hover:bg-neutral-200 rounded-xl transition-all active:scale-95 disabled:opacity-20 shadow-lg"><Download size={18} /></button>
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-8 max-w-[1600px] mx-auto w-full space-y-10 pb-32">
        
        {statusMessage && (
          <div className="animate-in slide-in-from-top-4 fade-in duration-500">
            <div className={`border rounded-2xl px-5 py-4 flex items-center gap-4 ${statusMessage.type === 'error' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-indigo-500/5 border-indigo-500/20'}`}>
              <Info size={18} className="text-indigo-400" />
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">{statusMessage.text}</p>
            </div>
          </div>
        )}

        {/* TOP LEVEL KPIS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <button onClick={() => setActiveFilter('all')} className={`text-left p-6 rounded-3xl border transition-all duration-300 ${activeFilter === 'all' ? 'bg-indigo-600/5 border-indigo-500/40 shadow-xl shadow-indigo-500/5' : 'bg-neutral-900/40 border-neutral-900 hover:border-neutral-800'}`}>
            <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold mb-3">Total Registry</p>
            <div className="flex items-baseline gap-2"><span className={`text-4xl md:text-5xl font-light ${activeFilter === 'all' ? 'text-indigo-400' : 'text-white'}`}>{stats.total}</span><span className="text-[10px] text-neutral-600 font-bold uppercase">Orders</span></div>
          </button>
          <button onClick={() => toggleFilter('pending')} className={`text-left p-6 rounded-3xl border transition-all duration-300 ${activeFilter === 'pending' ? 'bg-amber-600/5 border-amber-500/40 shadow-xl shadow-amber-500/5' : 'bg-neutral-900/40 border-neutral-900 hover:border-neutral-800'}`}>
            <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold mb-3">Active Pipeline</p>
            <div className="flex items-baseline gap-2"><span className={`text-4xl md:text-5xl font-light ${activeFilter === 'pending' ? 'text-amber-400' : 'text-amber-500/80'}`}>{stats.pending}</span><span className="text-[10px] text-neutral-600 font-bold uppercase">Open</span></div>
          </button>
          <button onClick={() => toggleFilter('late')} className={`text-left p-6 rounded-3xl border transition-all duration-300 ${activeFilter === 'late' ? 'bg-rose-600/5 border-rose-500/40 shadow-xl shadow-rose-500/5' : 'bg-neutral-900/40 border-neutral-900 hover:border-neutral-800'}`}>
            <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold mb-3">Overdue Orders</p>
            <div className="flex items-baseline gap-2"><span className={`text-4xl md:text-5xl font-light ${activeFilter === 'late' ? 'text-rose-400' : 'text-rose-500/80'}`}>{stats.late}</span><span className="text-[10px] text-neutral-600 font-bold uppercase">Alerts</span></div>
          </button>
        </div>

        {/* REGISTRY TABLE */}
        <div className="bg-[#0c0c0c] border border-neutral-900 rounded-[2rem] overflow-hidden shadow-2xl">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 md:py-48 px-10 text-center">
              <Activity size={40} className="text-neutral-700 opacity-50 mb-8" />
              <h2 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">System Ready</h2>
              <p className="text-neutral-600 max-w-sm text-sm mb-10 leading-relaxed font-medium">Upload scanned POS documents or CSV data to initialize the order tracking system.</p>
              <label className="flex items-center gap-4 px-10 py-4 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-500 cursor-pointer shadow-xl active:scale-95 transition-all"><Plus size={18} /><span>Add New Records</span><input type="file" className="hidden" accept="image/*,.pdf,.csv" multiple onChange={handleMultiFileUpload} /></label>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500">
              <div className="bg-neutral-900/40 px-8 py-4 flex justify-between items-center border-b border-neutral-900">
                <div className="flex items-center gap-3"><Layers size={14} className="text-neutral-600" /><h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{activeFilter === 'all' ? 'Order Registry' : `View: ${activeFilter.toUpperCase()}`} {selectedVendor !== 'all' && `• ${selectedVendor}`}</h3></div>
                {(activeFilter !== 'all' || selectedVendor !== 'all') && (
                   <button onClick={() => { setActiveFilter('all'); setSelectedVendor('all'); }} className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300">Clear All Filters</button>
                )}
              </div>
              <div className="relative overflow-y-auto max-h-[60vh] no-scrollbar">
                {/* Desktop view */}
                <table className="w-full text-left border-collapse hidden lg:table">
                  <thead className="sticky top-0 z-[60] bg-[#0c0c0c]">
                    <tr className="border-b border-neutral-800">
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-12 text-center">#</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-24">Vendor</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-64">Customer</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest">Description/Notes</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-24">Est ID</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-32">Order #</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-24">Date</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-32">ETA</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-32">Status</th>
                      <th className="py-5 px-4 text-[9px] font-bold text-neutral-600 uppercase tracking-widest w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-900">
                    {filteredOrders.map(order => (<OrderRow key={order.id} order={order} onUpdateDescription={(id, text) => setOrders(prev => prev.map(o => o.id === id ? { ...o, description: text } : o))} onDelete={deleteOrder} />))}
                  </tbody>
                </table>
                {/* Mobile view rendering block fixed */}
                <div className="lg:hidden divide-y divide-neutral-900">
                  {filteredOrders.map(order => (
                    <OrderRow 
                      key={order.id} 
                      order={order} 
                      onUpdateDescription={(id, text) => setOrders(prev => prev.map(o => o.id === id ? { ...o, description: text } : o))} 
                      onDelete={deleteOrder} 
                    />
                  ))}
                  {filteredOrders.length === 0 && (
                    <div className="p-20 text-center text-neutral-600 text-xs font-bold uppercase tracking-widest">
                      No matching orders found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ANALYTICS HUD */}
        {orders.length > 0 && (
          <div className="space-y-10 pt-16 border-t border-neutral-900">
            <div className="flex flex-col md:flex-row justify-between items-end gap-6">
              <div className="space-y-1">
                <h2 className="text-4xl font-bold text-white tracking-tight uppercase">Operational Metrics</h2>
                <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Performance Reporting & Data Visuals</p>
              </div>
              <button onClick={generateInsights} disabled={isGeneratingInsights} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-xl active:scale-95 disabled:opacity-50">
                {isGeneratingInsights ? <Loader2 size={16} className="animate-spin" /> : <FileText size={18} />}
                {isGeneratingInsights ? 'Compiling Summary...' : 'Generate Executive Report'}
              </button>
            </div>

            {/* CORE ANALYTICS BUBBLES */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-neutral-900/30 border border-neutral-900 p-6 rounded-[2rem] flex flex-col justify-between relative group">
                <button onClick={() => setActiveInfo({ title: "Lead Velocity", text: "The average number of days between the order placement date and the expected arrival date across all registry items." })} className="absolute top-4 right-4 text-neutral-600 hover:text-white"><Info size={14} /></button>
                <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold">Average Lead Time</p>
                <div className="flex items-baseline gap-2 mt-4"><span className="text-4xl font-light text-indigo-400">{stats.avgLeadTime}</span><span className="text-[10px] text-neutral-600 font-bold uppercase">Days</span></div>
              </div>
              <div className="bg-neutral-900/30 border border-neutral-900 p-6 rounded-[2rem] flex flex-col justify-between relative group">
                <button onClick={() => setActiveInfo({ title: "Fulfillment Score", text: "The percentage of orders in the registry that are currently marked as 'Fulfilled' or 'Received'." })} className="absolute top-4 right-4 text-neutral-600 hover:text-white"><Info size={14} /></button>
                <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold">Registry Fulfillment</p>
                <div className="flex items-baseline gap-2 mt-4"><span className="text-4xl font-light text-emerald-400">{stats.fulfillmentRate}%</span><span className="text-[10px] text-neutral-600 font-bold uppercase">Complete</span></div>
              </div>
              <div className="bg-neutral-900/30 border border-neutral-900 p-6 rounded-[2rem] flex flex-col justify-between relative group">
                <button onClick={() => setActiveInfo({ title: "Vendor Latency", text: "The average delay in days for orders that have passed their expected arrival date without being fulfilled." })} className="absolute top-4 right-4 text-neutral-600 hover:text-white"><Info size={14} /></button>
                <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-bold">Average Delay</p>
                <div className="flex items-baseline gap-2 mt-4"><span className="text-4xl font-light text-rose-400">{stats.avgAging}</span><span className="text-[10px] text-neutral-600 font-bold uppercase">Days Late</span></div>
              </div>
            </div>

            {/* CHART GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Monthly Volume */}
              <div className="bg-neutral-900/30 border border-neutral-900 p-8 rounded-3xl space-y-8 relative">
                <button onClick={() => setActiveInfo({ title: "Monthly volume", text: "Tracks total order quantity ingested each month to identify seasonal trends." })} className="absolute top-6 right-6 text-neutral-600 hover:text-white"><Info size={14} /></button>
                <div className="flex items-center gap-3 border-b border-neutral-800 pb-4"><CalendarDays className="text-indigo-400" size={18} /><h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Monthly Load</h3></div>
                <div className="flex items-end justify-between h-40 gap-2">
                  {monthlyVolumeData.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="w-full bg-neutral-800/20 rounded-lg relative overflow-hidden h-full flex items-end">
                        <div className="w-full bg-indigo-500/30 group-hover:bg-indigo-500/60 transition-all duration-500" style={{ height: `${(d.value / Math.max(...monthlyVolumeData.map(v => v.value), 1)) * 100}%` }} />
                      </div>
                      <span className="text-[8px] font-bold text-neutral-700 uppercase">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="bg-neutral-900/30 border border-neutral-900 p-8 rounded-3xl space-y-8 relative">
                <button onClick={() => setActiveInfo({ title: "Status Distribution", text: "Visualizes the percentage of total orders in each major operational state." })} className="absolute top-6 right-6 text-neutral-600 hover:text-white"><Info size={14} /></button>
                <div className="flex items-center gap-3 border-b border-neutral-800 pb-4"><PieChart className="text-emerald-400" size={18} /><h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Composition</h3></div>
                <div className="space-y-5 flex-1 flex flex-col justify-center">
                  {statusDistData.map(([label, count]) => (
                    <div key={label} className="space-y-1.5">
                      <div className="flex justify-between text-[9px] font-bold uppercase text-neutral-500"><span>{label}</span><span>{count}</span></div>
                      <div className="h-1.5 w-full bg-neutral-800/40 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-1000 ${label === 'Fulfilled' ? 'bg-emerald-500/60' : label === 'Exceptions' ? 'bg-rose-500/60' : 'bg-indigo-500/60'}`} style={{ width: `${(count / orders.length) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Distribution */}
              <div className="bg-neutral-900/30 border border-neutral-900 p-8 rounded-3xl space-y-8 relative">
                <button onClick={() => setActiveInfo({ title: "Weekly Distribution", text: "Identifies which days of the week receive the highest volume of order activity." })} className="absolute top-6 right-6 text-neutral-600 hover:text-white"><Info size={14} /></button>
                <div className="flex items-center gap-3 border-b border-neutral-800 pb-4"><Activity className="text-slate-400" size={18} /><h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Load Density</h3></div>
                <div className="flex items-center justify-between h-40 gap-3 pt-2">
                  {dayOfWeekData.map((d, i) => {
                    const opacity = (d.value / Math.max(...dayOfWeekData.map(v => v.value), 1)) || 0.1;
                    return (
                      <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
                         <div className="w-full rounded-lg transition-all duration-700 border border-indigo-500/10" style={{ height: '100%', backgroundColor: `rgba(99, 102, 241, ${opacity * 0.3})` }} />
                        <span className="text-[8px] font-bold text-neutral-700 uppercase">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* EXECUTIVE REPORT PANEL */}
            {aiInsights && (
              <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
                <div className="bg-indigo-600/5 border border-indigo-500/20 rounded-[3rem] p-10 space-y-12 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-600/20 rounded-2xl flex items-center justify-center text-indigo-400 shadow-inner"><FileText size={28} /></div>
                    <div className="space-y-1"><h3 className="text-3xl font-bold text-white tracking-tight uppercase">Executive Summary</h3><p className="text-indigo-500 text-[10px] font-bold uppercase tracking-widest">Generated Analysis</p></div>
                  </div>
                  <div className="space-y-8">
                    <p className="text-2xl text-neutral-200 font-light leading-relaxed max-w-5xl border-l-4 border-indigo-600/30 pl-10">"{aiInsights.summary}"</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
                      {aiInsights.insights.map((insight, idx) => (
                        <div key={idx} className="bg-neutral-900/40 border border-neutral-800 p-7 rounded-[2rem] space-y-4 hover:border-indigo-500/20 transition-all">
                          <div className="flex items-center gap-3">
                            {insight.type === 'alert' ? <Clock className="text-rose-500" size={20} /> : 
                             insight.type === 'positive' ? <CheckCircle2 className="text-emerald-500" size={20} /> : 
                             <TrendingUp className="text-amber-500" size={20} />}
                            <h4 className="text-[11px] font-bold text-neutral-100 uppercase tracking-wider">{insight.title}</h4>
                          </div>
                          <p className="text-xs text-neutral-400 leading-relaxed font-medium">{insight.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {isGeneratingInsights && (
               <div className="animate-in fade-in duration-500">
                <div className="bg-neutral-900/10 border border-neutral-800 rounded-[3rem] p-24 flex flex-col items-center justify-center space-y-6">
                  <Loader2 size={40} className="animate-spin text-indigo-500" />
                  <div className="text-center space-y-2"><h3 className="text-xl font-bold text-white uppercase tracking-tight">Compiling Intelligence</h3><p className="text-neutral-600 text-[10px] font-bold uppercase tracking-widest">Evaluating Operational Efficiency...</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        <footer className="flex flex-col md:flex-row justify-between items-center gap-6 pt-16 pb-24 border-t border-neutral-900/50">
          <div className="text-[10px] text-neutral-700 font-bold tracking-widest uppercase flex items-center gap-2">REGISTRY ACTIVE • {stats.total} TOTAL RECORDS</div>
          <div className="flex items-center gap-10">
             <button onClick={handleFactoryReset} className="text-neutral-800 hover:text-rose-600 transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest group"><Trash2 size={14} /> Clear System Memory</button>
             <div className="h-4 w-px bg-neutral-900" />
             <p className="text-neutral-800 text-[10px] font-bold uppercase tracking-widest">Version 4.5.2 • Deployment Finalized</p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;
