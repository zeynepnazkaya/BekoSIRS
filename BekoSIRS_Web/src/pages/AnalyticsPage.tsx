import React, { useState, useEffect } from 'react';
import Sidebar from "../components/Sidebar";
import StockIntelligenceWidget from "../components/StockIntelligenceWidget";
import { KpiCard, SimpleBarChart } from "./DashboardComponents";
import { BarChart3, TrendingUp, Users, Mail, FileText, RefreshCw, Play, Eye } from "lucide-react";
import {
    chartsAPI,
    salesForecastAPI,
    marketingAPI,
    auditLogAPI
} from '../services/api';

// Tab Types
type TabType = 'charts' | 'forecast' | 'marketing' | 'audit' | 'stock';

export default function AnalyticsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('charts');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [chartsData, setChartsData] = useState<any>(null);
    const [forecastData, setForecastData] = useState<any>(null);
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
// Forecast Content
// ==========================================
const ForecastContent: React.FC<{ data: any }> = ({ data }) => {
    if (!data) return <EmptyState />;

    const topForecasts = data.top_forecasts || [];

    return (
        <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900">Satış Tahminleri (3 Aylık)</h3>
                    <p className="text-sm text-gray-500 mt-1">AI destekli satış projeksiyonları</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ürün</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Stok</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Trend</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ay 1</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ay 2</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ay 3</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Öneri</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {topForecasts.slice(0, 10).map((item: any, idx: number) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <p className="font-medium text-gray-900">{item.product_name}</p>
                                        <p className="text-xs text-gray-500">{item.brand}</p>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${item.current_stock === 0 ? 'bg-red-100 text-red-700' :
                                            item.current_stock < 10 ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-green-100 text-green-700'
                                            }`}>
                                            {item.current_stock}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${item.trend === 'increasing' ? 'bg-green-100 text-green-700' :
                                            item.trend === 'decreasing' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
                                            {item.trend === 'increasing' ? '📈 Artıyor' :
                                                item.trend === 'decreasing' ? '📉 Azalıyor' : '➡️ Stabil'}
                                        </span>
                                    </td>
                                    {item.forecasts?.slice(0, 3).map((f: any, fIdx: number) => (
                                        <td key={fIdx} className="px-6 py-4 text-center font-bold text-gray-900">
                                            {f.predicted_sales}
                                        </td>
                                    ))}
                                    <td className="px-6 py-4 text-sm text-gray-600">{item.recommendation}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


// ==========================================
// Marketing Content
// ==========================================
const MarketingContent: React.FC<{ data: any }> = ({ data }) => {
    const [runningCampaign, setRunningCampaign] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);

    if (!data) return <EmptyState />;

    const campaigns = data.campaigns || {};

    const runCampaign = async (campaignKey: string, dryRun: boolean = true) => {
        setRunningCampaign(campaignKey);
        try {
            const response = await marketingAPI.runCampaign(campaignKey as any, dryRun);
            setResult({ campaign: campaignKey, ...response.data });
        } catch (err: any) {
            setResult({ error: err.message });
        } finally {
            setRunningCampaign(null);
        }
    };

    const campaignCards = [
        { key: 'birthday', name: 'Doğum Günü', icon: '🎂', desc: 'Doğum günü yaklaşanlara indirim', color: 'yellow' },
        { key: 'churn_prevention', name: 'Kayıp Önleme', icon: '💔', desc: '90+ gün inaktif müşteriler', color: 'red' },
        { key: 'review_request', name: 'Yorum İsteği', icon: '⭐', desc: 'Son 30 günde alışveriş yapanlar', color: 'purple' },
        { key: 'welcome', name: 'Hoş Geldin', icon: '🎉', desc: 'Son 7 günde kayıt olanlar', color: 'green' },
        { key: 'installment_reminder', name: 'Taksit Hatırlatma', icon: '💳', desc: '7 gün içinde ödeme vadesi', color: 'blue' },
        { key: 'delivery_feedback', name: 'Teslimat Geri Bildirimi', icon: '📦', desc: 'Son 30 günde teslimat alanlar', color: 'teal' },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {campaignCards.map(card => {
                    const campaign = campaigns[card.key] || {};
                    return (
                        <div key={card.key} className={`bg-white border-2 border-${card.color}-200 rounded-2xl p-6`}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <span className="text-3xl">{card.icon}</span>
                                    <h3 className="font-bold text-gray-900 mt-2">{card.name}</h3>
                                    <p className="text-sm text-gray-500">{card.desc}</p>
                                </div>
                                <div className={`bg-${card.color}-100 text-${card.color}-700 px-4 py-2 rounded-full font-bold`}>
                                    {campaign.eligible || 0} müşteri
                                </div>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => runCampaign(card.key, true)}
                                    disabled={runningCampaign === card.key}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors disabled:opacity-50"
                                >
                                    <Eye size={16} />
                                    Test Et
                                </button>
                                <button
                                    onClick={() => runCampaign(card.key, false)}
                                    disabled={runningCampaign === card.key}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-${card.color}-600 hover:bg-${card.color}-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50`}
                                >
                                    <Play size={16} />
                                    {runningCampaign === card.key ? 'Çalışıyor...' : 'Gönder'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Result */}
            {result && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
                    <h3 className="font-bold text-gray-900 mb-4">📊 Kampanya Sonucu</h3>
                    <pre className="bg-gray-50 p-4 rounded-xl text-sm overflow-auto">
                        {JSON.stringify(result, null, 2)}
                    </pre>
                </div>
            )}
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

// Empty State Component
const EmptyState = () => (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-12 text-center">
        <span className="text-4xl">📊</span>
        <p className="text-gray-500 mt-4">Veri bulunamadı</p>
    </div>
);
