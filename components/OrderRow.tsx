
import React, { useState } from 'react';
import { Order } from '../types';
import { isOrderLate, getStatusColor } from '../utils/dateUtils';
import { Trash2, ChevronDown, ChevronUp, Calendar, Hash, Package, Clock } from 'lucide-react';

interface OrderRowProps {
  order: Order;
  onUpdateDescription: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

const OrderRow: React.FC<OrderRowProps> = ({ order, onUpdateDescription, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLate = isOrderLate(order.status, order.expectedRecvDate);
  const statusColor = getStatusColor(order.status, order.expectedRecvDate);

  const getShortName = (name: string) => {
    if (!name) return '';
    const parts = name.split(' - ');
    return parts[0].trim();
  };

  return (
    <>
      {/* Desktop Layout */}
      <tr className="hidden lg:table-row border-b border-neutral-800 hover:bg-neutral-900/40 transition-colors group">
        <td className="py-4 px-4 text-[10px] text-neutral-600 mono text-center">{order.lineNumber}</td>
        <td className="py-4 px-4">
          <span className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded text-xs font-black tracking-widest mono uppercase">
            {order.vendorCode}
          </span>
        </td>
        <td className="py-4 px-4 font-bold text-neutral-100 uppercase tracking-tight text-sm">
          {getShortName(order.customerName)}
        </td>
        <td className="py-4 px-4">
          <input
            type="text"
            value={order.description}
            onChange={(e) => onUpdateDescription(order.id, e.target.value)}
            placeholder="Add classification..."
            className="w-full bg-transparent border-b border-transparent focus:border-indigo-500/50 outline-none text-neutral-400 text-xs py-1 placeholder:text-neutral-700 transition-all"
          />
        </td>
        <td className="py-4 px-4 text-[10px] text-neutral-500 mono">{order.estNum}</td>
        <td className="py-4 px-4 text-sm text-neutral-200 mono font-black">{order.orderNum}</td>
        <td className="py-4 px-4 text-[10px] text-neutral-500">{order.orderDate}</td>
        <td className={`py-4 px-4 text-xs font-bold ${isLate ? 'text-rose-500' : 'text-neutral-400'}`}>
          {order.expectedRecvDate}
          {isLate && <span className="ml-1.5 px-1 bg-rose-500/10 rounded text-[8px] uppercase tracking-widest">Late</span>}
        </td>
        <td className={`py-4 px-4 text-[11px] font-black uppercase tracking-widest ${statusColor}`}>
          {order.status}
        </td>
        <td className="py-4 px-4 text-right">
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(order.id); }}
            className="p-2 text-neutral-700 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={16} />
          </button>
        </td>
      </tr>

      {/* Mobile Fluid Layout */}
      <div 
        className={`lg:hidden border-b border-neutral-900 p-5 space-y-4 transition-all cursor-pointer ${isExpanded ? 'bg-neutral-900/50' : 'bg-transparent'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
               <span className="px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded text-[10px] font-bold mono tracking-widest uppercase">
                {order.vendorCode}
              </span>
              <span className="text-indigo-400 font-bold mono text-xs">#{order.orderNum}</span>
            </div>
            <h3 className="font-bold text-white text-lg uppercase tracking-tight leading-none truncate max-w-[200px]">
              {getShortName(order.customerName)}
            </h3>
            <div className="flex items-center gap-4 pt-1">
              <div className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${statusColor}`}>
                <span className={`w-2 h-2 rounded-full bg-current ${isLate ? 'animate-pulse' : ''}`} />
                {order.status}
              </div>
              <div className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isLate ? 'text-rose-400' : 'text-neutral-500'}`}>
                <Clock size={12} />
                ETA: {order.expectedRecvDate}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2 shrink-0">
             <div className="flex items-center gap-2">
               <button 
                onClick={(e) => { e.stopPropagation(); onDelete(order.id); }}
                className="p-2.5 text-neutral-700 active:text-rose-500 bg-neutral-900/50 rounded-xl border border-neutral-800"
              >
                <Trash2 size={18} />
              </button>
              <div className={`p-2.5 rounded-xl border transition-colors ${isExpanded ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-neutral-900/50 text-neutral-600 border-neutral-800'}`}>
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
             </div>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-4 pt-4 border-t border-neutral-800 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <p className="text-[9px] uppercase text-neutral-600 font-bold tracking-widest mb-2 flex items-center gap-1.5">
                <Package size={12} /> ITEM CLASSIFICATION
              </p>
              <input
                type="text"
                value={order.description}
                onChange={(e) => onUpdateDescription(order.id, e.target.value)}
                placeholder="Enter item details..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 outline-none text-neutral-300 text-sm placeholder:text-neutral-700 focus:border-indigo-500/20 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[9px] uppercase text-neutral-600 font-bold tracking-widest flex items-center gap-1.5"><Hash size={12} /> SYSTEM ID</p>
                <p className="text-xs text-neutral-400 mono">EST: <span className="text-neutral-200">{order.estNum || '---'}</span></p>
                <p className="text-[10px] text-neutral-600 truncate">Source: {order.customerName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] uppercase text-neutral-600 font-bold tracking-widest flex items-center gap-1.5"><Calendar size={12} /> LOGISTICS</p>
                <p className="text-xs text-neutral-400">Placed: <span className="text-neutral-200">{order.orderDate}</span></p>
                {isLate && <span className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded uppercase tracking-tighter">SLA BREACH</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default OrderRow;
