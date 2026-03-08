import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import * as Lucide from "lucide-react";
import { deliveryAPI, deliveryRouteAPI } from "../services/api";
import api from "../services/api";
import type { Delivery, DeliveryStats } from "../types/delivery";
import Toast, { type ToastType } from "../components/Toast";

/* ============ Interfaces ============ */
interface RouteStop {
    stop_order: number;
    delivery: {
        id: number;
        customer_name: string;
        customer_address: string;
        product_name: string;
        product_model_code: string;
        quantity: number;
        status: string;
        status_display: string;
    };
    distance_from_previous_km: number;
    duration_from_previous_min: number;
}

interface RouteData {
    id: number;
    date: string;
    total_distance_km: number;
    total_duration_min: number;
    is_optimized: boolean;
    assigned_driver: number | null;
    driver_name: string | null;
    status: string;
    stop_count: number;
    stops: RouteStop[];
}

interface DriverUser {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
}

export default function DeliveriesPage() {
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [stats, setStats] = useState<DeliveryStats | null>(null);
    const [loading, setLoading] = useState(true);

    // Filters
    const [dateFilter, setDateFilter] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState<string>("");

    // Modal & Actions
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Optimization State
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [optimizing, setOptimizing] = useState(false);

    // Routes State
    const [routes, setRoutes] = useState<RouteData[]>([]);
    const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);
    const [loadingRoutes, setLoadingRoutes] = useState(false);

    // Driver Assignment
    const [drivers, setDrivers] = useState<DriverUser[]>([]);
    const [driverModalOpen, setDriverModalOpen] = useState(false);
    const [selectedDriverId, setSelectedDriverId] = useState<number | "">("");
    const [assigningRouteId, setAssigningRouteId] = useState<number | null>(null);
    const [assigningDriver, setAssigningDriver] = useState(false);

    // Toast
    const [toastMessage, setToastMessage] = useState("");
    const [toastType, setToastType] = useState<ToastType>("info");
    const [toastOpen, setToastOpen] = useState(false);

    // Delete Modal
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchData();
        fetchStats();
        fetchDrivers();
    }, [dateFilter, statusFilter]);

    useEffect(() => {
        if (dateFilter) {
            fetchRoutes();
        } else {
            setRoutes([]);
        }
    }, [dateFilter]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (dateFilter) params.date = dateFilter;
            if (statusFilter) params.status = statusFilter;

            const response = await deliveryAPI.list(params);
            const data = response.data;
            const list = data?.results || data;
            setDeliveries(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error("Error fetching deliveries:", error);
            showToast("Teslimatlar yüklenirken hata oluştu", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const params: any = {};
            if (dateFilter) params.date = dateFilter;
            const response = await deliveryAPI.stats(params);
            setStats(response.data);
        } catch (error) {
            console.error("Error fetching stats:", error);
        }
    };

    const fetchRoutes = async () => {
        try {
            setLoadingRoutes(true);
            const response = await deliveryRouteAPI.getByDate(dateFilter);
            const data = response.data;
            const list = data?.results || data;
            setRoutes(Array.isArray(list) ? list : []);
        } catch {
            setRoutes([]);
        } finally {
            setLoadingRoutes(false);
        }
    };

    const fetchDrivers = async () => {
        try {
            const res = await api.get("/users/?role=delivery");
            const data = res.data;
            setDrivers(Array.isArray(data) ? data : data.results || []);
        } catch { /* ignore */ }
    };

    /* ============ Actions ============ */
    const handleEdit = (delivery: Delivery) => {
        setSelectedDelivery(delivery);
        setModalOpen(true);
    };

    const handleDelete = (id: number) => {
        if (!id) return;
        setDeleteId(id);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            setDeleting(true);
            await deliveryAPI.delete(deleteId);
            showToast("Teslimat silindi", "success");
            fetchData(); fetchStats(); fetchRoutes();
            setDeleteModalOpen(false);
        } catch (error: any) {
            showToast(error.response?.data?.error || "Silme işlemi başarısız", "error");
        } finally {
            setDeleting(false);
            setDeleteId(null);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDelivery) return;
        setSubmitting(true);
        const formData = new FormData(e.target as HTMLFormElement);
        const data = {
            status: formData.get("status"),
            scheduled_date: formData.get("scheduled_date"),
            notes: formData.get("notes"),
        };
        try {
            await deliveryAPI.update(selectedDelivery.id, data);
            showToast("Teslimat güncellendi", "success");
            setModalOpen(false);
            fetchData(); fetchStats();
        } catch {
            showToast("Güncelleme başarısız", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSelect = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedIds.length === deliveries.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(deliveries.map(d => d.id));
        }
    };

    const handleOptimize = async () => {
        if (selectedIds.length === 0) return;
        if (!dateFilter) {
            showToast("Lütfen önce bir tarih seçin", "warning");
            return;
        }
        setOptimizing(true);
        try {
            const response = await deliveryAPI.optimize({
                date: dateFilter,
                delivery_ids: selectedIds
            });
            if (response.data.route_id) {
                showToast(`Rota optimize edildi! ${response.data.stop_count} durak, ${response.data.total_distance_km} km`, "success");
                fetchData();
                fetchRoutes();
                setSelectedIds([]);
            }
        } catch (error: any) {
            showToast(error.response?.data?.error || "Optimizasyon başarısız", "error");
        } finally {
            setOptimizing(false);
        }
    };

    /* --- Driver Assignment --- */
    const openDriverModal = (routeId: number) => {
        setAssigningRouteId(routeId);
        setSelectedDriverId("");
        setDriverModalOpen(true);
    };

    const handleAssignDriverToRoute = async () => {
        if (!assigningRouteId || !selectedDriverId) return;
        setAssigningDriver(true);
        try {
            // Find all delivery IDs in this route
            const route = routes.find(r => r.id === assigningRouteId);
            if (!route || !route.stops.length) {
                showToast("Rota durakları bulunamadı", "error");
                return;
            }
            const deliveryIds = route.stops.map(s => s.delivery.id);

            await deliveryAPI.assignDriver(deliveryIds, Number(selectedDriverId));
            showToast("Teslimatçı atandı!", "success");
            setDriverModalOpen(false);
            fetchRoutes();
            fetchData();
        } catch (error: any) {
            showToast(error.response?.data?.error || "Atama başarısız", "error");
        } finally {
            setAssigningDriver(false);
        }
    };

    const showToast = (message: string, type: ToastType) => {
        setToastMessage(message);
        setToastType(type);
        setToastOpen(true);
    };

    const handleRefresh = () => {
        fetchData(); fetchStats(); fetchRoutes();
        showToast("Liste güncellendi", "success");
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'WAITING':
                return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium flex items-center gap-1"><Lucide.Clock size={12} /> Bekliyor</span>;
            case 'OUT_FOR_DELIVERY':
                return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium flex items-center gap-1"><Lucide.Truck size={12} /> Dağıtımda</span>;
            case 'DELIVERED':
                return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium flex items-center gap-1"><Lucide.CheckCircle size={12} /> Teslim Edildi</span>;
            case 'FAILED':
                return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium flex items-center gap-1"><Lucide.XCircle size={12} /> Başarısız</span>;
            default:
                return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">{status}</span>;
        }
    };

    const getRouteStatusBadge = (status: string) => {
        switch (status) {
            case 'PLANNED':
                return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">Planlandı</span>;
            case 'IN_PROGRESS':
                return <span className="px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full text-xs font-medium">Devam Ediyor</span>;
            case 'COMPLETED':
                return <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-medium">Tamamlandı</span>;
            default:
                return <span className="px-2.5 py-1 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-xs font-medium">{status}</span>;
        }
    };

    return (
        <div className="flex bg-gray-50 min-h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="px-8 py-5 flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <Lucide.Truck className="text-blue-600" />
                                Teslimat Yönetimi
                            </h1>
                            <p className="text-sm text-gray-500 mt-1">Teslimat planlaması, rota yönetimi ve takibi</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleRefresh} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition" title="Yenile">
                                <Lucide.RefreshCw size={20} />
                            </button>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-[1920px] mx-auto space-y-6">

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                                <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg">
                                    <Lucide.Clock size={24} />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 font-medium">Bekleyen Teslimatlar</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.waiting_count || 0}</p>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                    <Lucide.Calendar size={24} />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 font-medium">Seçili Tarihte Planlanan</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.scheduled_for_selected_date_count || 0}</p>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                                <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                                    <Lucide.CheckCircle size={24} />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 font-medium">Son 10 Günde Teslim Edilen</p>
                                    <p className="text-2xl font-bold text-gray-900">{stats?.delivered_last_10_days_count || 0}</p>
                                </div>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
                            <div className="flex items-center gap-2">
                                <Lucide.Filter className="text-gray-400" size={20} />
                                <span className="text-sm font-medium text-gray-700">Filtreler:</span>
                            </div>

                            <div className="relative">
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                                <Lucide.Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            </div>

                            <div className="relative min-w-[200px]">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white"
                                >
                                    <option value="">Tüm Durumlar</option>
                                    <option value="WAITING">Bekliyor</option>
                                    <option value="OUT_FOR_DELIVERY">Dağıtımda</option>
                                    <option value="DELIVERED">Teslim Edildi</option>
                                    <option value="FAILED">Başarısız</option>
                                </select>
                                <Lucide.ListFilter className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                <Lucide.ChevronDown className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={16} />
                            </div>

                            {(dateFilter || statusFilter) && (
                                <button
                                    onClick={() => { setDateFilter(""); setStatusFilter(""); }}
                                    className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                                >
                                    <Lucide.X size={16} /> Filtreleri Temizle
                                </button>
                            )}
                        </div>

                        {/* Optimization Action Bar */}
                        {selectedIds.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">
                                        {selectedIds.length}
                                    </div>
                                    <span className="text-blue-900 font-medium">Teslimat seçildi</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setSelectedIds([])}
                                        className="px-4 py-2 text-gray-600 hover:bg-white hover:text-gray-900 rounded-lg transition-colors font-medium text-sm"
                                    >
                                        Vazgeç
                                    </button>
                                    <button
                                        onClick={handleOptimize}
                                        disabled={optimizing}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm flex items-center gap-2"
                                    >
                                        {optimizing ? <Lucide.Loader2 className="animate-spin" size={18} /> : <Lucide.Zap size={18} />}
                                        Rotayı Optimize Et
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ===== ROUTES SECTION ===== */}
                        {dateFilter && routes.length > 0 && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-blue-50 flex items-center justify-between">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <Lucide.Route size={20} className="text-green-600" />
                                        Bu Tarihteki Rotalar ({routes.length})
                                    </h3>
                                </div>

                                <div className="divide-y divide-gray-100">
                                    {routes.map(route => (
                                        <div key={route.id}>
                                            {/* Route Summary Row */}
                                            <div
                                                className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                                onClick={() => setExpandedRouteId(expandedRouteId === route.id ? null : route.id)}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2 rounded-lg ${expandedRouteId === route.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'} transition-colors`}>
                                                        <Lucide.Map size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900 flex items-center gap-2">
                                                            Rota #{route.id}
                                                            {getRouteStatusBadge(route.status)}
                                                        </div>
                                                        <div className="text-sm text-gray-500 flex items-center gap-4 mt-1">
                                                            <span className="flex items-center gap-1">
                                                                <Lucide.MapPin size={12} /> {route.stop_count} durak
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Lucide.Navigation size={12} /> {route.total_distance_km} km
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Lucide.Clock size={12} />
                                                                {Math.floor(route.total_duration_min / 60) > 0
                                                                    ? `${Math.floor(route.total_duration_min / 60)} saat ${Math.round(route.total_duration_min % 60)} dk`
                                                                    : `${Math.round(route.total_duration_min)} dk`
                                                                }
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {route.driver_name ? (
                                                        <span className="text-sm text-gray-700 flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full border border-purple-200">
                                                            <Lucide.UserCheck size={14} /> {route.driver_name}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openDriverModal(route.id); }}
                                                            className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition-colors"
                                                        >
                                                            <Lucide.UserPlus size={14} /> Teslimatçı Ata
                                                        </button>
                                                    )}
                                                    <div className={`transition-transform ${expandedRouteId === route.id ? 'rotate-180' : ''}`}>
                                                        <Lucide.ChevronDown size={20} className="text-gray-400" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Route Details (Expanded) */}
                                            {expandedRouteId === route.id && (
                                                <div className="px-6 pb-6 bg-gray-50/50">
                                                    {/* Route KPI Row */}
                                                    <div className="grid grid-cols-3 gap-4 mb-4">
                                                        <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
                                                            <p className="text-sm text-blue-600 font-medium">Toplam Mesafe</p>
                                                            <p className="text-2xl font-bold text-blue-800">{route.total_distance_km} km</p>
                                                        </div>
                                                        <div className="bg-orange-50 rounded-xl p-4 text-center border border-orange-100">
                                                            <p className="text-sm text-orange-600 font-medium">Tahmini Süre</p>
                                                            <p className="text-2xl font-bold text-orange-800">
                                                                {Math.floor(route.total_duration_min / 60) > 0
                                                                    ? `${Math.floor(route.total_duration_min / 60)} saat ${Math.round(route.total_duration_min % 60)} dk`
                                                                    : `${Math.round(route.total_duration_min)} dk`
                                                                }
                                                            </p>
                                                        </div>
                                                        <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
                                                            <p className="text-sm text-green-600 font-medium">Durak Sayısı</p>
                                                            <p className="text-2xl font-bold text-green-800">{route.stop_count}</p>
                                                        </div>
                                                    </div>

                                                    {/* Stops Timeline */}
                                                    <div className="space-y-0">
                                                        {route.stops && route.stops.map((stop, idx) => (
                                                            <div key={idx} className="flex items-stretch gap-4">
                                                                {/* Timeline Line */}
                                                                <div className="flex flex-col items-center">
                                                                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 z-10">
                                                                        {stop.stop_order}
                                                                    </div>
                                                                    {idx < route.stops.length - 1 && (
                                                                        <div className="w-0.5 flex-1 bg-blue-200 min-h-[16px]"></div>
                                                                    )}
                                                                </div>

                                                                {/* Stop Card */}
                                                                <div className="flex-1 bg-white rounded-lg border border-gray-200 p-3 mb-2 shadow-sm">
                                                                    <div className="flex justify-between items-start">
                                                                        <div>
                                                                            <p className="font-medium text-gray-900">{stop.delivery?.customer_name || 'Müşteri'}</p>
                                                                            <p className="text-sm text-gray-500">{stop.delivery?.product_name}</p>
                                                                            {stop.delivery?.customer_address && (
                                                                                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                                                                    <Lucide.MapPin size={10} /> {stop.delivery.customer_address}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-right text-sm flex-shrink-0 ml-4">
                                                                            <p className="text-gray-700 font-semibold">{stop.distance_from_previous_km} km</p>
                                                                            <p className="text-xs text-gray-500">{stop.duration_from_previous_min} dk</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Route Actions */}
                                                    {!route.driver_name && (
                                                        <div className="mt-4 flex justify-end">
                                                            <button
                                                                onClick={() => openDriverModal(route.id)}
                                                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                                                            >
                                                                <Lucide.UserPlus size={16} /> Teslimatçıya Ata
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ===== DELIVERIES TABLE ===== */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <Lucide.Package size={18} className="text-gray-500" />
                                    Teslimatlar ({deliveries.length})
                                </h3>
                            </div>
                            {loading ? (
                                <div className="p-12 text-center">
                                    <Lucide.Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                                    <p className="text-gray-500">Teslimatlar yükleniyor...</p>
                                </div>
                            ) : deliveries.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Lucide.Inbox size={32} />
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-1">Teslimat Bulunamadı</h3>
                                    <p className="text-gray-500">Seçilen filtrelere uygun teslimat kaydı yok.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-3 w-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.length === deliveries.length && deliveries.length > 0}
                                                        onChange={handleSelectAll}
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Müşteri / Ürün</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adres</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sıra</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durum</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {deliveries.map((delivery) => (
                                                <tr key={delivery.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(delivery.id) ? 'bg-blue-50/50' : ''}`}>
                                                    <td className="px-6 py-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.includes(delivery.id)}
                                                            onChange={() => handleSelect(delivery.id)}
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center">
                                                            <div>
                                                                <div className="text-sm font-medium text-gray-900">{delivery.customer_name || 'İsimsiz Müşteri'}</div>
                                                                <div className="text-sm text-gray-500">{delivery.product_name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-gray-900 max-w-xs truncate" title={delivery.address}>
                                                            {delivery.address || '-'}
                                                        </div>
                                                        {delivery.address_lat && delivery.address_lng ? (
                                                            <div className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                                                                <Lucide.MapPin size={10} /> Konum Var
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs text-orange-600 flex items-center gap-1 mt-0.5 font-medium">
                                                                <Lucide.AlertTriangle size={10} /> Konum Eksik
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">{delivery.scheduled_date}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">
                                                            {delivery.delivery_order !== undefined && delivery.delivery_order !== null
                                                                ? <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold">{delivery.delivery_order}</span>
                                                                : '-'
                                                            }
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {getStatusBadge(delivery.status)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => handleEdit(delivery)}
                                                                className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded-lg transition"
                                                                title="Düzenle"
                                                            >
                                                                <Lucide.PenSquare size={18} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(delivery.id)}
                                                                className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition"
                                                                title="Sil"
                                                            >
                                                                <Lucide.Trash2 size={18} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {/* Toast */}
            {toastOpen && (
                <div className="fixed top-4 right-4 z-50">
                    <Toast
                        message={toastMessage}
                        type={toastType}
                        onClose={() => setToastOpen(false)}
                    />
                </div>
            )}

            {/* Edit Modal */}
            {modalOpen && selectedDelivery && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-900">Teslimat Düzenle</h3>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <Lucide.X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdate} className="p-6 space-y-4">
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 mb-4">
                                <span className="font-bold">{selectedDelivery.customer_name}</span> - {selectedDelivery.product_name}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
                                <select name="status" defaultValue={selectedDelivery.status}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
                                    <option value="WAITING">Bekliyor</option>
                                    <option value="OUT_FOR_DELIVERY">Dağıtımda</option>
                                    <option value="DELIVERED">Teslim Edildi</option>
                                    <option value="FAILED">Başarısız</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Teslimat Tarihi</label>
                                <input type="date" name="scheduled_date" defaultValue={selectedDelivery.scheduled_date}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                                <textarea name="notes" defaultValue={selectedDelivery.notes || ''}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none min-h-[80px]"
                                    placeholder="Teslimat notları..." />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setModalOpen(false)}
                                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">İptal</button>
                                <button type="submit" disabled={submitting}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                    {submitting ? <Lucide.Loader2 className="animate-spin" size={18} /> : "Kaydet"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Lucide.AlertTriangle size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Teslimatı Sil?</h3>
                            <p className="text-gray-500 text-sm mb-6">Bu işlem geri alınamaz.</p>

                            <div className="flex gap-3">
                                <button onClick={() => setDeleteModalOpen(false)} disabled={deleting}
                                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">İptal</button>
                                <button onClick={confirmDelete} disabled={deleting}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                    {deleting ? <Lucide.Loader2 className="animate-spin" size={18} /> : "Sil"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Driver Assignment Modal */}
            {driverModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-900">Teslimatçı Ata</h3>
                            <button onClick={() => setDriverModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <Lucide.X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800">
                                <span className="font-bold">Rota #{assigningRouteId}</span> için teslimatçı seçin.
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Teslimatçı <span className="text-red-500">*</span></label>
                                <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
                                    <option value="">Seçiniz</option>
                                    {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} ({d.username})</option>)}
                                </select>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setDriverModalOpen(false)}
                                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">İptal</button>
                                <button onClick={handleAssignDriverToRoute} disabled={assigningDriver || !selectedDriverId}
                                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                    {assigningDriver ? <Lucide.Loader2 className="animate-spin" size={18} /> : "Ata"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
