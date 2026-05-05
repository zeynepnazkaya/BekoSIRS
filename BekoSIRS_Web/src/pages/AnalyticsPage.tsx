import React, { useState, useEffect } from 'react';
import Sidebar from "../components/Sidebar";
import StockIntelligenceWidget from "../components/StockIntelligenceWidget";
import { KpiCard, SimpleBarChart } from "./DashboardComponents";
import { ProfessionalSalesChart } from "../components/ProfessionalCharts";
import { BarChart3, TrendingUp, Users, Mail, FileText, RefreshCw, Snowflake, Play } from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ReferenceLine,
} from 'recharts';
import {
    chartsAPI,
    salesForecastAPI,
    marketingAPI,
    auditLogAPI
} from '../services/api';

// Tab Types
type TabType = 'charts' | 'forecast' | 'seasonal' | 'marketing' | 'audit' | 'stock';

export default function AnalyticsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('charts');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [chartsData, setChartsData] = useState<any>(null);
    const [forecastData, setForecastData] = useState<any>(null);
    const [seasonalData, setSeasonalData] = useState<any>(null);
    const [marketingData, setMarketingData] = useState<any>(null);
    const [auditData, setAuditData] = useState<any>(null);

    // Load data based on active tab
    useEffect(() => {
        const loadData = async () => {
            // Stock tab handles its own data
            if (activeTab === 'stock') return;

            setLoading(true);
            setError(null);
            try {
                switch (activeTab) {
                    case 'charts':
                        const charts = await chartsAPI.getAll();
                        setChartsData(charts.data);
                        break;
                    case 'forecast':
                        const forecast = await salesForecastAPI.getSummary();
                        setForecastData(forecast.data);
                        break;
                    case 'seasonal':
                        const seasonal = await salesForecastAPI.getSeasonalAnalysis();
                        setSeasonalData(seasonal.data);
                        break;
                    case 'marketing':
                        const marketing = await marketingAPI.getStats();
                        setMarketingData(marketing.data);
                        break;
                    case 'audit':
                        const audit = await auditLogAPI.getLogs(50);
                        setAuditData(audit.data);
                        break;
                }
            } catch (err: any) {
                setError(err.response?.data?.detail || err.message || 'Veri yüklenirken hata oluştu');
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [activeTab]);

    const tabs = [
        { id: 'charts' as TabType, label: 'Dashboard Grafikleri', icon: BarChart3 },
        { id: 'stock' as TabType, label: 'Stok Zekası', icon: TrendingUp },
        { id: 'forecast' as TabType, label: 'Satış Tahmini', icon: Play },
        { id: 'seasonal' as TabType, label: 'Mevsimsel Analiz', icon: Snowflake },
        { id: 'marketing' as TabType, label: 'Pazarlama', icon: Mail },
        { id: 'audit' as TabType, label: 'Denetim Kayıtları', icon: FileText },
    ];

    return (
        <div className="flex bg-gray-50 min-h-screen">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="px-8 py-5 flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Analitikler & Raporlar</h1>
                            <p className="text-sm text-gray-500 mt-1">İşletme verilerinizi analiz edin ve akıllı kararlar alın</p>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-[1920px] mx-auto space-y-6">

                        {/* Tab Navigation */}
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-2 flex gap-2 overflow-x-auto">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${activeTab === tab.id
                                        ? 'bg-black text-white shadow-lg'
                                        : 'text-gray-600 hover:bg-gray-100'
                                        }`}
                                >
                                    <tab.icon size={18} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Loading State */}
                        {loading && activeTab !== 'stock' && (
                            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-12 text-center">
                                <RefreshCw className="mx-auto animate-spin text-blue-600 mb-4" size={32} />
                                <p className="text-gray-500">Veriler yükleniyor...</p>
                            </div>
                        )}

                        {/* Error State */}
                        {error && activeTab !== 'stock' && (
                            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">
                                <p className="font-medium">❌ Hata</p>
                                <p className="text-sm mt-1">{error}</p>
                            </div>
                        )}

                        {/* Content */}
                        {!loading && !error && (
                            <>
                                {activeTab === 'charts' && <ChartsContent data={chartsData} />}
                                {activeTab === 'stock' && <StockIntelligenceWidget />}
                                {activeTab === 'forecast' && <ForecastContent data={forecastData} />}
                                {activeTab === 'seasonal' && <SeasonalContent data={seasonalData} />}
                                {activeTab === 'marketing' && <MarketingContent data={marketingData} />}
                                {activeTab === 'audit' && <AuditContent data={auditData} />}
                            </>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

// ==========================================
// Charts Content
// ==========================================
const ChartsContent: React.FC<{ data: any }> = ({ data }) => {
    if (!data) return <EmptyState />;

    const summary = data.summary || {};
    const revenueData = data.revenue_by_category?.datasets?.[0]?.data || [];
    const revenueLabels = data.revenue_by_category?.labels || [];
    const topProducts = data.top_products?.labels || [];
    const topProductsData = data.top_products?.datasets?.[0]?.data || [];
    const customerSegments = data.customer_segments?.datasets?.[0]?.data || [];
    const segmentLabels = data.customer_segments?.labels || [];

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    title="Bugün Satış"
                    value={summary.today_sales || 0}
                    icon={BarChart3}
                    color="blue"
                    subtext="Bugünkü satış adedi"
                />
                <KpiCard
                    title="Bugün Gelir"
                    value={`₺${(summary.today_revenue || 0).toLocaleString()}`}
                    icon={TrendingUp}
                    color="green"
                    subtext="Bugünkü ciro"
                />
                <KpiCard
                    title="Bekleyen Servis"
                    value={summary.pending_service || 0}
                    icon={RefreshCw}
                    color="yellow"
                    subtext="İşlem bekliyor"
                />
                <KpiCard
                    title="Toplam Müşteri"
                    value={summary.total_customers || 0}
                    icon={Users}
                    color="purple"
                    subtext="Kayıtlı müşteriler"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue by Category */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Kategori Bazlı Gelir</h3>
                    <div className="space-y-3">
                        {revenueLabels.slice(0, 6).map((label: string, idx: number) => {
                            const maxRevenue = Math.max(...revenueData.slice(0, 6), 1);
                            const percentage = (revenueData[idx] / maxRevenue) * 100;
                            return (
                                <div key={idx}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">{label}</span>
                                        <span className="font-bold text-gray-900">₺{(revenueData[idx] || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                        <div
                                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Top Products */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <h3 className="font-bold text-gray-900 mb-4">En Çok Satan Ürünler</h3>
                    <div className="space-y-3">
                        {topProducts.slice(0, 5).map((product: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                                    idx === 1 ? 'bg-gray-200 text-gray-600' :
                                        idx === 2 ? 'bg-orange-100 text-orange-700' :
                                            'bg-gray-100 text-gray-500'
                                    }`}>
                                    {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{product}</p>
                                </div>
                                <span className="text-sm font-bold text-blue-600">{topProductsData[idx]} adet</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Customer Segments */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Müşteri Segmentleri</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {segmentLabels.map((label: string, idx: number) => {
                            const colors = ['bg-yellow-100 text-yellow-700', 'bg-purple-100 text-purple-700', 'bg-blue-100 text-blue-700', 'bg-gray-100 text-gray-700', 'bg-green-100 text-green-700'];
                            return (
                                <div key={idx} className={`${colors[idx] || 'bg-gray-100'} p-4 rounded-xl text-center`}>
                                    <p className="text-2xl font-bold">{customerSegments[idx] || 0}</p>
                                    <p className="text-sm font-medium">{label}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Service Status */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Servis Durumları</h3>
                    <SimpleBarChart
                        title=""
                        data={(data.service_by_status?.labels || []).map((label: string, idx: number) => ({
                            name: label,
                            value: data.service_by_status?.datasets?.[0]?.data?.[idx] || 0
                        }))}
                    />
                </div>
            </div>
        </div>
    );
};

// ==========================================
// Forecast Content - with 3/12 month toggle & AreaChart
// ==========================================
const ForecastContent: React.FC<{ data: any }> = ({ data: initialData }) => {
    const [forecastMonths, setForecastMonths] = useState<3 | 12>(3);
    const [data, setData] = useState<any>(initialData);
    const [loading, setLoading] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<number>(0);

    // Reload data when months change
    useEffect(() => {
        const reload = async () => {
            setLoading(true);
            try {
                const res = await salesForecastAPI.getSummary(forecastMonths);
                setData(res.data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        reload();
    }, [forecastMonths]);

    if (!data && !loading) return <EmptyState />;

    const topForecasts = data?.top_forecasts || [];
    const modelInfo = data?.model_info;
    const currentProduct = topForecasts[selectedProduct];

    // Build chart data: historical 12 months + forecast N months
    const buildChartData = (product: any) => {
        if (!product) return [];
        const historical = (product.historical_monthly || []).map((h: any) => ({
            name: h.month,
            historical: h.sales,
            predicted: null as number | null,
            lower: null as number | null,
            upper: null as number | null,
        }));
        const forecast = (product.forecasts || []).map((f: any) => ({
            name: f.month,
            historical: null as number | null,
            predicted: f.predicted_sales,
            lower: f.lower_bound,
            upper: f.upper_bound,
        }));
        // Bridge: last historical point connects to first forecast
        if (historical.length > 0 && forecast.length > 0) {
            const lastHist = historical[historical.length - 1];
            forecast[0].historical = lastHist.historical;
        }
        return [...historical, ...forecast];
    };

    const chartData = buildChartData(currentProduct);

    return (
        <div className="space-y-6">
            {/* Header with Month Toggle */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Model Info Banner */}
                {modelInfo ? (
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                            <TrendingUp size={20} className="text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">Ridge Regression AI Modeli Aktif</p>
                            <p className="text-xs text-gray-500 truncate">
                                R²={modelInfo.test_r2?.toFixed(3)} · MAE={modelInfo.test_mae?.toFixed(1)} · {modelInfo.n_samples} örnek
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-yellow-700">
                        <RefreshCw size={16} />
                        <span>AI modeli eğitiliyor...</span>
                    </div>
                )}

                {/* Month Toggle */}
                <div className="flex bg-white p-1.5 rounded-xl shadow-sm border border-gray-200 self-start md:self-auto">
                    <button
                        onClick={() => setForecastMonths(3)}
                        className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${forecastMonths === 3
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        3 Aylık
                    </button>
                    <button
                        onClick={() => setForecastMonths(12)}
                        className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${forecastMonths === 12
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        12 Aylık
                    </button>
                </div>
            </div>

            {/* Model Metrics Cards */}
            {modelInfo && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                        <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Train R²</p>
                        <p className="text-2xl font-bold text-blue-900 mt-1">{modelInfo.train_r2?.toFixed(3) ?? '—'}</p>
                    </div>
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-xl border border-indigo-200">
                        <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide">Test R²</p>
                        <p className="text-2xl font-bold text-indigo-900 mt-1">{modelInfo.test_r2?.toFixed(3) ?? '—'}</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
                        <p className="text-xs text-purple-600 font-medium uppercase tracking-wide">Test MAE</p>
                        <p className="text-2xl font-bold text-purple-900 mt-1">{modelInfo.test_mae?.toFixed(1) ?? '—'}</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
                        <p className="text-xs text-green-600 font-medium uppercase tracking-wide">CI ±95%</p>
                        <p className="text-2xl font-bold text-green-900 mt-1">{modelInfo.ci_95_halfwidth ?? '—'} adet</p>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-12 text-center">
                    <RefreshCw className="mx-auto animate-spin text-blue-600 mb-4" size={32} />
                    <p className="text-gray-500">Tahminler hesaplanıyor...</p>
                </div>
            ) : (
                <>
                    {/* Product Selector */}
                    {topForecasts.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                            <h3 className="font-bold text-gray-900 mb-4">📈 Satış Tahmin Grafiği — Geçmiş 12 Ay + Gelecek {forecastMonths} Ay</h3>
                            <div className="flex flex-wrap gap-2 mb-6">
                                {topForecasts.slice(0, 10).map((item: any, idx: number) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedProduct(idx)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedProduct === idx
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        {item.product_name?.substring(0, 25)}
                                    </button>
                                ))}
                            </div>

                            {/* AreaChart */}
                            {chartData.length > 0 && (
                                <div className="h-[400px]">
                                    <ForecastAreaChart data={chartData} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Forecast Table */}
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900">Satış Tahminleri — Ridge Regresyon ({forecastMonths} Aylık)</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                {modelInfo
                                    ? `${modelInfo.model_type} · 95% güven aralığı: ±${modelInfo.ci_95_halfwidth ?? '—'} adet`
                                    : 'Trend tabanlı projeksiyon'}
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50">Ürün</th>
                                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Stok</th>
                                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Trend</th>
                                        {currentProduct?.forecasts?.map((_: any, idx: number) => (
                                            <th key={idx} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                                                {topForecasts[0]?.forecasts?.[idx]?.month || `Ay ${idx + 1}`}
                                            </th>
                                        ))}
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Öneri</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {topForecasts.slice(0, 10).map((item: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 sticky left-0 bg-white">
                                                <p className="font-medium text-gray-900 text-sm truncate max-w-[180px]">{item.product_name}</p>
                                                <p className="text-xs text-gray-500">{item.brand}</p>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.current_stock === 0 ? 'bg-red-100 text-red-700' :
                                                    item.current_stock < 10 ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-green-100 text-green-700'
                                                    }`}>
                                                    {item.current_stock}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className={`text-xs font-medium ${item.trend === 'increasing' ? 'text-green-600' :
                                                    item.trend === 'decreasing' ? 'text-red-600' : 'text-gray-500'
                                                    }`}>
                                                    {item.trend === 'increasing' ? '📈' : item.trend === 'decreasing' ? '📉' : '➡️'}
                                                </span>
                                            </td>
                                            {item.forecasts?.map((f: any, fIdx: number) => (
                                                <td key={fIdx} className="px-3 py-3 text-center">
                                                    <span className="font-bold text-gray-900 text-sm">{f.predicted_sales}</span>
                                                    {f.lower_bound != null && f.upper_bound != null && (
                                                        <span className="block text-xs text-gray-400 mt-0.5">
                                                            {f.lower_bound}–{f.upper_bound}
                                                        </span>
                                                    )}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px]">{item.recommendation}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};


// ==========================================
// Marketing Content
// ==========================================
const MarketingContent: React.FC<{ data: any }> = ({ data }) => {
    const [activePeriod, setActivePeriod] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');

    if (!data) return <EmptyState />;

    const salesChart = data.sales_chart || { weekly: [], monthly: [], yearly: [] };

    // Prepare chart data
    const currentChartData = salesChart[activePeriod] || [];

    return (
        <div className="space-y-6">
            {/* Sales Chart Section - Professional */}
            <div className="bg-gradient-to-br from-slate-50 to-gray-100 rounded-2xl shadow-sm p-6 border border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h3 className="font-bold text-gray-900 text-xl flex items-center gap-2">
                            📊 Satış Performans Analizi
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Pazarlama stratejilerinizi belirlemek için satış trendlerini inceleyin</p>
                    </div>

                    <div className="flex bg-white p-1.5 rounded-xl shadow-sm self-start md:self-auto">
                        <button
                            onClick={() => setActivePeriod('weekly')}
                            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${activePeriod === 'weekly'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Haftalık
                        </button>
                        <button
                            onClick={() => setActivePeriod('monthly')}
                            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${activePeriod === 'monthly'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Aylık
                        </button>
                        <button
                            onClick={() => setActivePeriod('yearly')}
                            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${activePeriod === 'yearly'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Yıllık
                        </button>
                    </div>
                </div>

                {currentChartData.length > 0 ? (
                    <ProfessionalSalesChart
                        data={currentChartData}
                        period={activePeriod}
                        showRevenue={false}
                    />
                ) : (
                    <div className="h-[400px] flex items-center justify-center text-gray-400 bg-white rounded-xl">
                        <div className="text-center">
                            <div className="text-6xl mb-4">📊</div>
                            <p className="text-lg font-medium">Veri bulunamadı</p>
                            <p className="text-sm">Seçilen dönem için satış verisi yok</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// ==========================================
// Audit Content
// ==========================================
const AuditContent: React.FC<{ data: any }> = ({ data }) => {
    if (!data) return <EmptyState />;

    const logs = data.logs || [];

    const actionColors: Record<string, string> = {
        'Oluşturma': 'bg-green-100 text-green-700',
        'Güncelleme': 'bg-blue-100 text-blue-700',
        'Silme': 'bg-red-100 text-red-700',
        'Giriş': 'bg-purple-100 text-purple-700',
        'Çıkış': 'bg-gray-100 text-gray-700',
    };

    return (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-gray-900">Denetim Kayıtları</h3>
                    <p className="text-sm text-gray-500">Son {logs.length} işlem</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Zaman</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Kullanıcı</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">İşlem</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Model</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">IP</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    Henüz kayıt yok
                                </td>
                            </tr>
                        ) : (
                            logs.map((log: any, idx: number) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {new Date(log.timestamp).toLocaleString('tr-TR')}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{log.user}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{log.model || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-400">{log.ip_address || '-'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ==========================================
// Seasonal Content - Heat Map
// ==========================================
const SeasonalContent: React.FC<{ data: any }> = ({ data }) => {
    if (!data) return <EmptyState />;

    const products = data.seasonal_products || [];
    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
        "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    // Heat map color based on sales intensity (0-max)
    const getHeatColor = (value: number, maxValue: number) => {
        if (value === 0) return 'bg-gray-50 text-gray-400';
        const intensity = maxValue > 0 ? value / maxValue : 0;
        if (intensity >= 0.8) return 'bg-blue-600 text-white font-bold';
        if (intensity >= 0.6) return 'bg-blue-500 text-white';
        if (intensity >= 0.4) return 'bg-blue-400 text-white';
        if (intensity >= 0.2) return 'bg-blue-200 text-blue-900';
        return 'bg-blue-100 text-blue-700';
    };

    return (
        <div className="space-y-6">
            {/* Category Summary */}
            {data.category_summary && Object.keys(data.category_summary).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <h3 className="font-bold text-gray-900 mb-4">📊 Kategori Bazlı Mevsimsellik</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {Object.entries(data.category_summary).map(([category, info]: [string, any]) => (
                            <div key={category} className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
                                <p className="font-medium text-gray-900">{category}</p>
                                <p className="text-sm text-gray-600 mt-1">
                                    {info.products_count} ürün
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {info.peak_months?.map((month: string) => (
                                        <span key={month} className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                                            {month}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Heat Map Table */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900">🗓️ Aylık Satış Isı Haritası</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Her ürünün hangi aylarda daha çok sattığını gösterir
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[200px]">Ürün</th>
                                {months.map(month => (
                                    <th key={month} className="px-2 py-3 text-center font-semibold text-gray-600 min-w-[60px]">
                                        {month.substring(0, 3)}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-center font-semibold text-gray-600">Toplam</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-600">Öneri</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={15} className="px-6 py-12 text-center text-gray-500">
                                        Henüz yeterli satış verisi yok
                                    </td>
                                </tr>
                            ) : (
                                products.map((product: any, idx: number) => {
                                    const monthlySales = product.monthly_sales || {};
                                    const maxSale = Math.max(...Object.values(monthlySales) as number[]);

                                    return (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 sticky left-0 bg-white">
                                                <p className="font-medium text-gray-900 truncate max-w-[200px]">{product.product_name}</p>
                                                <p className="text-xs text-gray-500">{product.category}</p>
                                            </td>
                                            {months.map(month => (
                                                <td key={month} className="px-1 py-1 text-center">
                                                    <div className={`py-2 rounded ${getHeatColor(monthlySales[month] || 0, maxSale)}`}>
                                                        {monthlySales[month] || 0}
                                                    </div>
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 text-center font-bold text-gray-900">
                                                {product.total_year_sales}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs text-gray-600">{product.recommendation}</span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Data Period Info */}
            {data.data_period && (
                <div className="text-center text-sm text-gray-400">
                    Veri Dönemi: {data.data_period.start} → {data.data_period.end}
                </div>
            )}
        </div>
    );
};

// ==========================================
// Forecast AreaChart Component
// ==========================================
const ForecastChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-900 text-white p-3 rounded-xl shadow-xl border border-gray-700 text-sm">
                <p className="font-semibold mb-1">{label}</p>
                {payload.map((entry: any, index: number) => {
                    if (entry.value == null) return null;
                    return (
                        <div key={index} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-gray-300">{entry.name}:</span>
                            <span className="font-bold">{entry.value}</span>
                        </div>
                    );
                })}
            </div>
        );
    }
    return null;
};

const ForecastAreaChart: React.FC<{ data: any[] }> = ({ data }) => {
    // Find the boundary index between historical and forecast
    const boundaryIdx = data.findIndex(d => d.predicted !== null && d.historical === null);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorHistorical" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCI" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={50}
                />
                <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                />
                <Tooltip content={<ForecastChartTooltip />} />
                <Legend
                    wrapperStyle={{ paddingTop: '15px' }}
                    iconType="circle"
                />
                {boundaryIdx > 0 && (
                    <ReferenceLine
                        x={data[boundaryIdx]?.name}
                        stroke="#6b7280"
                        strokeDasharray="5 5"
                        label={{ value: 'Tahmin Başlangıcı', position: 'top', fontSize: 10, fill: '#6b7280' }}
                    />
                )}
                {/* Confidence band (shaded area between lower and upper) */}
                <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="none"
                    fill="url(#colorCI)"
                    fillOpacity={1}
                    name="Üst Sınır"
                    connectNulls={false}
                />
                <Area
                    type="monotone"
                    dataKey="lower"
                    stroke="none"
                    fill="#ffffff"
                    fillOpacity={1}
                    name="Alt Sınır"
                    connectNulls={false}
                />
                {/* Historical line */}
                <Area
                    type="monotone"
                    dataKey="historical"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorHistorical)"
                    name="Geçmiş Satış"
                    connectNulls={false}
                />
                {/* Predicted line */}
                <Area
                    type="monotone"
                    dataKey="predicted"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    strokeDasharray="5 3"
                    fillOpacity={1}
                    fill="url(#colorPredicted)"
                    name="Tahmin"
                    connectNulls={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};

// Empty State Component
const EmptyState = () => (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-12 text-center">
        <span className="text-4xl">📊</span>
        <p className="text-gray-500 mt-4">Veri bulunamadı</p>
    </div>
);
