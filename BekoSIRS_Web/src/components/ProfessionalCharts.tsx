import React from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend
} from 'recharts';

// Types
interface SalesDataPoint {
    label: string;
    sales: number;
    revenue: number;
}

interface ProfessionalChartProps {
    data: SalesDataPoint[];
    period: 'weekly' | 'monthly' | 'yearly';
    showRevenue?: boolean;
}

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-900 text-white p-4 rounded-xl shadow-xl border border-gray-700">
                <p className="font-semibold text-sm mb-2">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-gray-300">{entry.name}:</span>
                        <span className="font-bold">
                            {entry.name === 'Gelir'
                                ? `₺${entry.value.toLocaleString('tr-TR')}`
                                : entry.value.toLocaleString('tr-TR')
                            }
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// Main Professional Chart Component
export const ProfessionalSalesChart: React.FC<ProfessionalChartProps> = ({
    data,
    period,
    showRevenue = true
}) => {
    // Format data for Recharts
    const chartData = data.map(d => ({
        name: d.label,
        Satış: d.sales,
        Gelir: d.revenue
    }));

    // Calculate summary stats
    const totalSales = data.reduce((acc, d) => acc + d.sales, 0);
    const totalRevenue = data.reduce((acc, d) => acc + d.revenue, 0);

    // Get period label
    const periodLabels = {
        weekly: 'Son 7 Gün',
        monthly: 'Son 30 Gün',
        yearly: 'Son 12 Ay'
    };

    return (
        <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-xl">
                    <p className="text-blue-100 text-xs font-medium uppercase tracking-wider">Toplam Satış</p>
                    <p className="text-2xl font-bold mt-1">{totalSales.toLocaleString('tr-TR')}</p>
                    <p className="text-blue-200 text-xs mt-1">adet</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4 rounded-xl">
                    <p className="text-emerald-100 text-xs font-medium uppercase tracking-wider">Toplam Gelir</p>
                    <p className="text-2xl font-bold mt-1">₺{totalRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
                    <p className="text-emerald-200 text-xs mt-1">{periodLabels[period]}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 rounded-xl">
                    <p className="text-purple-100 text-xs font-medium uppercase tracking-wider">Ort. Satış Değeri</p>
                    <p className="text-2xl font-bold mt-1">₺{totalSales > 0 ? (totalRevenue / totalSales).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : 0}</p>
                    <p className="text-purple-200 text-xs mt-1">satış başına</p>
                </div>
            </div>

            {/* Main Chart */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                        {showRevenue ? (
                            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={{ stroke: '#e5e7eb' }}
                                />
                                <YAxis
                                    yAxisId="left"
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => value === 0 ? '0' : `₺${(value / 1000).toFixed(0)}K`}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ paddingTop: '20px' }}
                                    iconType="circle"
                                />
                                <Area
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="Gelir"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorRevenue)"
                                />
                                <Area
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="Satış"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorSales)"
                                />
                            </AreaChart>
                        ) : (
                            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={{ stroke: '#e5e7eb' }}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ paddingTop: '20px' }}
                                    iconType="circle"
                                />
                                <Bar dataKey="Satış" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

// Export for single metric chart
export const SimpleMetricChart: React.FC<{
    data: Array<{ name: string; value: number }>;
    title?: string;
    color?: string;
}> = ({ data, title, color = '#3b82f6' }) => {
    return (
        <div className="h-full">
            {title && <h3 className="font-bold text-gray-900 mb-4">{title}</h3>}
            <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10, fill: '#6b7280' }}
                            tickLine={false}
                            axisLine={{ stroke: '#e5e7eb' }}
                        />
                        <YAxis
                            tick={{ fontSize: 10, fill: '#6b7280' }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1f2937',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontSize: '12px'
                            }}
                        />
                        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
