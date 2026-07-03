import { useMemo, useState } from 'react';
import {
 TrendingUp,
 Calendar,
 Receipt
} from 'lucide-react';
import { usePhones, useAccessories, useSales, useExchanges } from '@/lib/api';
import { formatLKR, cn, monthColombo, monthBounds, todayColombo, lastNDaysColombo, weekdayShortColombo } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';

export default function Dashboard() {
 const { phones } = usePhones();
 const { accessories } = useAccessories();
 const { sales } = useSales();
 const { exchanges } = useExchanges();
 const { isAdmin } = useAuth();

 // Monthly summary — a second, month-scoped query (gte/lte pushed into Supabase),
 // fixing the "monthly sales shows the whole amount" complaint (there was no month filter).
 const [selectedMonth, setSelectedMonth] = useState<string>(monthColombo()); // 'YYYY-MM'
 const monthRange = useMemo(() => monthBounds(selectedMonth), [selectedMonth]);
 const { sales: monthSales, isLoading: monthLoading } = useSales(monthRange);
 const monthly = useMemo(() => {
   const revenue = monthSales.reduce((sum, s) => sum + s.totalRevenue, 0);
   const profit = monthSales.reduce((sum, s) => {
     const cost = s.items.reduce((acc, item) => acc + item.costPrice, 0);
     return sum + (s.totalRevenue - cost);
   }, 0);
   return { revenue, count: monthSales.length, profit };
 }, [monthSales]);

 const stats = useMemo(() => {
  const phonesInStock = phones.filter(p => p.status === 'in-stock').length;
  const accessoriesInStock = accessories.reduce((sum, a) => sum + a.quantity, 0);
  const soldPhones = phones.filter(p => p.status === 'sold').length;
  const totalSoldAccessories = sales.reduce((sum, sale) => {
  return sum + sale.items.filter(i => i.type === 'accessory').reduce((qtySum, i) => qtySum + (i.quantity || 1), 0);
  }, 0);
  
  const today = todayColombo();
  const todaySales = sales.filter(s => s.date === today);
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.totalRevenue, 0);
  const todayProfit = todaySales.reduce((sum, s) => {
  const cost = s.items.reduce((acc, item) => acc + item.costPrice, 0);
  return sum + (s.totalRevenue - cost);
  }, 0);

  const inventoryValue = [
 ...phones.filter(p => p.status === 'in-stock'),
 ...accessories
 ].reduce((sum, item) => sum + (item.costPrice * (('quantity' in item) ? item.quantity : 1)), 0);

 const totalRevenueAllTime = sales.reduce((sum, s) => sum + s.totalRevenue, 0);
 const totalRefundedAllTime = sales.reduce((sum, s) => sum + (s.totalRefunded ?? 0), 0);
 const totalCostAllTime = sales.reduce((sum, s) => {
 const saleCost = s.items.reduce((itemSum, item) => itemSum + item.costPrice, 0);
 return sum + saleCost;
 }, 0);
 
 // Potential profit only on in-stock phones (Target Price - Cost)
 const potentialProfit = phones
 .filter(p => p.status === 'in-stock')
 .reduce((sum, p) => sum + (p.targetSalePrice ? (p.targetSalePrice - p.costPrice) : 0), 0);

 const thisMonth = monthColombo(); // 'YYYY-MM' (Asia/Colombo)
 const returnsThisMonth = sales.filter(s =>
 s.date.startsWith(thisMonth) && (s.returnStatus === 'partial' || s.returnStatus === 'full')
 );
 const returnsThisMonthCount = returnsThisMonth.length;
 const returnsThisMonthValue = returnsThisMonth.reduce((sum, s) => sum + (s.totalRefunded ?? 0), 0);

 const tradeInsThisMonth = exchanges.filter(e =>
   (e.localUpdatedAt ?? '').startsWith(thisMonth)
 ).length;

 return {
 phonesInStock,
 accessoriesInStock,
 soldPhones,
 totalSoldAccessories,
 todayRevenue,
 todayProfit,
 inventoryValue,
 totalProfit: (totalRevenueAllTime - totalRefundedAllTime) - totalCostAllTime,
 potentialProfit,
 todayCount: todaySales.length,
 returnsThisMonthCount,
 returnsThisMonthValue,
 tradeInsThisMonth
 };
 }, [phones, accessories, sales, exchanges]);

 // Chart data: Sales for last 7 days
 const chartData = useMemo(() => {
 // Last 7 Asia/Colombo days so the weekly boundary matches how sales.date is stored (Colombo),
 // fixing the off-by-one "weekly revenue" bug near midnight.
 return lastNDaysColombo(7).map(date => {
 const daySales = sales.filter(s => s.date === date);
 const revenue = daySales.reduce((sum, s) => sum + s.totalRevenue, 0);
 const profit = daySales.reduce((sum, s) => {
 const cost = s.items.reduce((acc, item) => acc + item.costPrice, 0);
 return sum + (s.totalRevenue - cost);
 }, 0);
 return { label: weekdayShortColombo(date), revenue, profit, date };
 });
 }, [sales]);

 const recentSales = useMemo(() => {
 return [...sales]
 .sort((a, b) => new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime())
 .slice(0, 5);
 }, [sales]);

 // Staff dashboard (client issue 7.3): standard staff see ONLY Daily Revenue — no profit, cost,
 // inventory value, ROI, monthly aggregates, weekly chart, or history. Revenue is store-scoped +
 // cost-free at the DB (v_sales_public / Phase 7). isAdmin is fail-closed while the role loads.
 if (!isAdmin) {
 return (
 <div className="p-4 sm:p-8 max-w-2xl mx-auto space-y-8 min-h-screen bg-[var(--bg-app)]">
 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--line)] pb-6">
 <div>
 <h1 className="text-3xl text-[var(--ink)]">Daily Overview</h1>
 <p className="text-[var(--subtle)] text-sm mt-1">Point of Sale · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
 </div>
 <div className="px-3 py-1.5 bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] rounded-xl flex items-center gap-2 shadow-sm">
 <Calendar size={14} className="text-[var(--brand)]" />
 <span className="text-xs font-medium text-[var(--subtle)]">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
 </div>
 </div>
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
 <div className="bg-[var(--cream)] rounded-2xl shadow-sm p-8 relative overflow-hidden">
 <p className="text-[11px] font-semibold text-[var(--teal)]/70 mb-2 uppercase tracking-wide">Daily Revenue</p>
 <div className="flex items-baseline gap-1">
 <span className="font-display text-5xl font-semibold text-[var(--teal)]">{formatLKR(stats.todayRevenue).split(' ')[1]}</span>
 <span className="text-sm font-medium text-[var(--teal)]/60">{formatLKR(stats.todayRevenue).split(' ')[0]}</span>
 </div>
 <p className="text-[11px] text-[var(--teal)]/60 mt-3">{stats.todayCount} sales today</p>
 </div>
 </motion.div>
 </div>
 );
 }

 return (
 <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 min-h-screen bg-[var(--bg-app)]">
 {/* Header */}
 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--line)] pb-6">
 <div>
 <h1 className="text-3xl text-[var(--ink)]">
 Inventory Executive
 </h1>
 <p className="text-[var(--subtle)] text-sm mt-1">
 Operational Intelligence · {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
 </p>
 </div>
 <div className="flex items-center gap-3">
 <div className="px-3 py-1.5 bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] rounded-xl flex items-center gap-2 shadow-sm">
 <Calendar size={14} className="text-[var(--brand)]" />
 <span className="text-xs font-medium text-[var(--subtle)]">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
 </div>
 </div>
 </div>

 {/* Stats Grid */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
 <div className="bg-[var(--paper)] rounded-2xl shadow-sm p-5 border border-[var(--line)] relative overflow-hidden group">
 <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--brand)]" />
 <p className="text-xs font-medium text-[var(--subtle)] mb-2">Daily Revenue</p>
 <div className="flex items-baseline gap-1">
 <span className="text-3xl text-[var(--brand)]">{formatLKR(stats.todayRevenue).split(' ')[1]}</span>
 <span className="text-xs font-medium text-[var(--subtle)]">{formatLKR(stats.todayRevenue).split(' ')[0]}</span>
 </div>
 <p className="text-[11px] text-[var(--success)] mt-2 font-medium">
 {isAdmin && <span className="mr-2 border-r border-[var(--success)]/30 pr-2">Profit: {formatLKR(stats.todayProfit)}</span>}
 {stats.todayCount} Sales
 </p>
 </div>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
 <div className="bg-[var(--paper)] rounded-2xl shadow-sm p-5 border border-[var(--line)] relative overflow-hidden group">
 <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--success)]" />
 <p className="text-xs font-medium text-[var(--subtle)] mb-2">Stock Units</p>
 <div className="flex flex-col gap-0.5">
 <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-[var(--subtle)]">Phones:</span><span className="text-lg font-bold text-[var(--ink)]">{stats.phonesInStock}</span></div>
 <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-[var(--subtle)]">Accessories:</span><span className="text-lg font-bold text-[var(--ink)]">{stats.accessoriesInStock}</span></div>
 </div>
 <div className="mt-4 flex gap-1 h-1">
 {[...Array(12)].map((_, i) => (
 <div key={i} className={cn("flex-1 rounded-xl", i < Math.round(((stats.phonesInStock + stats.accessoriesInStock)/200)*12) ? 'bg-[var(--success)]' : 'bg-[var(--line)]')} />
 ))}
 </div>
 </div>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
 <div className="bg-[var(--paper)] rounded-2xl shadow-sm p-5 border border-[var(--line)] relative overflow-hidden group">
 <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--ink)]" />
 <p className="text-xs font-medium text-[var(--subtle)] mb-2">Inventory Value</p>
 <div className="flex items-baseline gap-1">
 <span className="text-3xl text-[var(--ink)]">{isAdmin ? formatLKR(stats.inventoryValue).split(' ')[1] : '----'}</span>
 <span className="text-xs font-medium text-[var(--subtle)]">{isAdmin ? formatLKR(stats.inventoryValue).split(' ')[0] : ''}</span>
 </div>
 <p className="text-[11px] text-[var(--subtle)] mt-2">{stats.soldPhones} Historical Units</p>
 </div>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
 <div className="bg-[var(--paper)] rounded-2xl shadow-sm p-5 border border-[var(--line)] relative overflow-hidden group">
 <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--brand)]" />
 <p className="text-xs font-medium text-[var(--brand)] mb-2">Projected ROI</p>
 <div className="flex items-baseline gap-1">
 <span className="text-3xl text-[var(--ink)]">{isAdmin ? formatLKR(stats.potentialProfit).split(' ')[1] : '----'}</span>
 <span className="text-xs font-medium text-[var(--brand)]">{isAdmin ? formatLKR(stats.potentialProfit).split(' ')[0] : ''}</span>
 </div>
 <p className="text-[11px] text-[var(--subtle)] mt-2">Market Analysis Active</p>
 </div>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
 <div className="bg-[var(--paper)] rounded-2xl shadow-sm p-5 border border-[var(--line)] relative overflow-hidden group">
 <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--danger)]" />
 <p className="text-xs font-medium text-[var(--danger)] mb-2">Returns This Month</p>
 <div className="flex items-baseline gap-1">
 <span className="text-3xl text-[var(--ink)]">{stats.returnsThisMonthCount + stats.tradeInsThisMonth}</span>
 <span className="text-xs font-medium text-[var(--danger)]">total</span>
 </div>
 <p className="text-[11px] text-[var(--subtle)] mt-2">{stats.returnsThisMonthCount} refunds · {stats.tradeInsThisMonth} trade-ins · LKR {stats.returnsThisMonthValue.toLocaleString()} refunded</p>
 </div>
 </motion.div>
 </div>

 {/* Monthly Summary */}
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
 className="bg-[var(--paper)] border border-[var(--line)] p-6 sm:p-8">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
 <div>
 <p className="text-xs text-[var(--subtle)] font-medium mb-1">Monthly Summary</p>
 <h3 className="text-2xl text-[var(--ink)]">Sales for {selectedMonth}</h3>
 </div>
 <div className="relative">
 <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)] pointer-events-none" size={14} />
 <input
 type="month"
 value={selectedMonth}
 max={monthColombo()}
 onChange={e => setSelectedMonth(e.target.value || monthColombo())}
 aria-label="Select month"
 className="pl-10 h-11 border border-[var(--line)] bg-[var(--bg-app)] rounded-xl text-[10px] font-bold text-[var(--ink)] focus:border-[var(--brand)] focus:outline-none"
 />
 </div>
 </div>
 <div className={cn("grid gap-4", isAdmin ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
 <div className="bg-[var(--bg-app)] rounded-xl p-5 border border-[var(--line)] relative overflow-hidden">
 <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--brand)]" />
 <p className="text-xs font-medium text-[var(--subtle)] mb-2">Monthly Revenue</p>
 <div className="flex items-baseline gap-1">
 <span className="text-3xl text-[var(--brand)]">{monthLoading ? '…' : formatLKR(monthly.revenue).split(' ')[1]}</span>
 <span className="text-xs font-medium text-[var(--subtle)]">{formatLKR(monthly.revenue).split(' ')[0]}</span>
 </div>
 </div>
 <div className="bg-[var(--bg-app)] rounded-xl p-5 border border-[var(--line)] relative overflow-hidden">
 <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--ink)]" />
 <p className="text-xs font-medium text-[var(--subtle)] mb-2">Sales Count</p>
 <span className="text-3xl text-[var(--ink)]">{monthLoading ? '…' : monthly.count}</span>
 <p className="text-[11px] text-[var(--subtle)] mt-2">transactions this month</p>
 </div>
 {isAdmin && (
 <div className="bg-[var(--bg-app)] rounded-xl p-5 border border-[var(--line)] relative overflow-hidden">
 <div className="absolute top-0 left-0 w-full h-[3px] bg-[var(--success)]" />
 <p className="text-xs font-medium text-[var(--success)] mb-2">Monthly Profit</p>
 <div className="flex items-baseline gap-1">
 <span className="text-3xl text-[var(--ink)]">{monthLoading ? '…' : formatLKR(monthly.profit).split(' ')[1]}</span>
 <span className="text-xs font-medium text-[var(--success)]">{formatLKR(monthly.profit).split(' ')[0]}</span>
 </div>
 </div>
 )}
 </div>
 </motion.div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* Sales Chart */}
 <div className="lg:col-span-2 bg-[var(--paper)] border border-[var(--line)] p-6 sm:p-8">
 <div className="flex items-center justify-between mb-8">
 <div>
 <p className="text-xs text-[var(--subtle)] font-medium mb-1">Performance Index</p>
 <h3 className="text-2xl text-[var(--ink)]">Weekly Revenue Flow</h3>
 </div>
 </div>
 <div className="h-[280px]">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
 <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: 'var(--subtle)', fontWeight: 600, fontFamily: 'JetBrains Mono' }} dy={10} />
 <YAxis hide />
 <RechartsTooltip 
 cursor={{ fill: 'var(--line)', opacity: 0.4 }}
 content={({ active, payload }) => {
 if (active && payload && payload.length) {
 return (
 <div className="bg-[var(--bg-app)] text-[var(--ink)] p-3 border border-[var(--line)]">
 <p className="text-[9px] font-bold text-[var(--subtle)] mb-1">{payload[0].payload.date}</p>
 <p className="text-xs font-bold text-[var(--brand)]">{formatLKR(payload[0].value as number)}</p>
 </div>
 );
 }
 return null;
 }}
 />
 <Bar dataKey="revenue" radius={[0, 0, 0, 0]} barSize={36}>
 {chartData.map((_, index) => (
 <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? 'var(--brand)' : 'var(--line)'} className="transition-all hover:opacity-80" />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Recent Activity */}
 <div className="bg-[var(--paper)] border border-[var(--line)] p-6 sm:p-8">
 <div className="flex items-center justify-between mb-8">
 <div>
 <p className="text-xs font-medium text-[var(--subtle)]">Audit Trail</p>
 <h3 className="text-2xl text-[var(--ink)]">Recent Ledger</h3>
 </div>
 </div>
 <div className="space-y-6">
 {recentSales.map((sale) => (
 <div key={sale.id} className="flex items-start gap-4 group justify-between">
 <div className="flex gap-4 min-w-0">
 <div className="w-9 h-9 bg-[var(--bg-app)] border border-[var(--line)] flex items-center justify-center shrink-0">
 <Receipt size={14} className="text-[var(--subtle)] group-hover:text-[var(--success)]" />
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-[11px] font-bold text-[var(--ink)] truncate ">{sale.items[0].name}</p>
 <p className="text-[9px] text-[var(--subtle)] mt-1">{sale.time} · {sale.date}</p>
 </div>
 </div>
 <div className="text-right shrink-0">
 <p className="text-[11px] font-bold text-[var(--brand)]">{formatLKR(sale.totalRevenue)}</p>
 <span className="text-[8px] font-bold text-[var(--success)] ">VERIFIED</span>
 </div>
 </div>
 ))}

 {recentSales.length === 0 && (
 <div className="flex flex-col items-center justify-center py-10 opacity-30">
 <TrendingUp size={32} className="mb-4 text-[var(--subtle)]" />
 <p className="text-[9px] font-bold text-[var(--subtle)]">Empty Ledger</p>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 );
}
