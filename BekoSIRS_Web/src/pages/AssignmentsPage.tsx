import React, { useEffect, useState, useMemo } from "react";
import * as Lucide from "lucide-react";
import Sidebar from "../components/Sidebar";
import { ToastContainer, type ToastType } from "../components/Toast";
import api from "../services/api";
import { assignmentAPI, deliveryAPI, deliveryRouteAPI } from "../services/api";

const {
    Package = () => <span>📦</span>,
    Plus = () => <span>+</span>,
    Search = () => <span>🔍</span>,
    Calendar = () => <span>📅</span>,
    X = () => <span>✕</span>,
    Trash2 = () => <span>🗑</span>,
    Loader2 = () => <span>↻</span>,
    AlertCircle = () => <span>⚠</span>,
    CheckCircle = () => <span>✓</span>,
    Truck = () => <span>🚚</span>,
    MapPin = () => <span>📍</span>,
    Route = () => <span>🗺️</span>,
    UserCheck = () => <span>👤</span>,
    Navigation = () => <span>🧭</span>,
} = Lucide as any;

/* ============ Interfaces ============ */
interface Customer {
    id: number; username: string; email: string;
    first_name: string; last_name: string;
    full_name?: string; formatted_address?: string; phone_number?: string;
}
interface Product {
    id: number; name: string; brand: string;
    model_code?: string; stock?: number; category?: { name: string };
}
interface ProductAssignment {
    id: number; customer: Customer; product: Product;
    assigned_at: string; status: string; status_display: string;
    quantity: number; notes?: string;
    delivery_info?: {
        id: number; status: string; status_display: string;
        scheduled_date: string; time_window_start?: string; time_window_end?: string;
    };
}
interface DeliveryItem {
    id: number; assignment: number;
    customer_name: string; customer_phone: string; customer_address: string;
    product_name: string; product_model_code: string; quantity: number;
    scheduled_date: string; status: string; status_display: string;
    delivery_order: number; address_lat: number; address_lng: number; driver_name?: string;
}
interface RouteResult {
    route_id: number; date: string;
    total_distance_km: number; total_duration_min: number; stop_count: number;
    stops: Array<{
        stop_order: number; delivery_id: number; customer_name: string;
        product_name: string; address: string; lat: number; lng: number;
        distance_from_previous_km: number; duration_from_previous_min: number;
    }>;
    warnings?: { no_coordinates?: number[] };
}
interface DriverUser { id: number; username: string; first_name: string; last_name: string; }

/* ============ Component ============ */
export default function AssignmentsPage() {
    /* --- Main Tab --- */
    const [mainTab, setMainTab] = useState<'unscheduled' | 'planning'>('unscheduled');

    /* --- Shared State --- */
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ planned: 0, scheduled: 0, out_for_delivery: 0, delivered: 0 });
    const [toasts, setToasts] = useState<Array<{ id: string; type: ToastType; message: string }>>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [drivers, setDrivers] = useState<DriverUser[]>([]);

    /* --- Tab 1: Unscheduled --- */
    const [assignments, setAssignments] = useState<ProductAssignment[]>([]);
    const [selectedUnscheduled, setSelectedUnscheduled] = useState<number[]>([]);
    const [searchUnscheduled, setSearchUnscheduled] = useState("");

    /* --- Tab 2: Planning --- */
    const [planningDate, setPlanningDate] = useState(new Date().toISOString().split("T")[0]);
    const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
    const [selectedDeliveries, setSelectedDeliveries] = useState<number[]>([]);
    const [searchPlanning, setSearchPlanning] = useState("");
    const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
    const [optimizing, setOptimizing] = useState(false);

    /* --- Modals --- */
    const [newSaleModal, setNewSaleModal] = useState(false);
    const [scheduleModal, setScheduleModal] = useState(false);
    const [batchScheduleModal, setBatchScheduleModal] = useState(false);
    const [driverModal, setDriverModal] = useState(false);
    const [deleteModal, setDeleteModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    /* --- Form State --- */
    const [selectedCustomer, setSelectedCustomer] = useState<number | "">("");
    const [selectedProduct, setSelectedProduct] = useState<number | "">("");
    const [assignedAt, setAssignedAt] = useState(new Date().toISOString().split("T")[0]);
    const [notes, setNotes] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [scheduleDate, setScheduleDate] = useState("");
    const [scheduleAssignmentId, setScheduleAssignmentId] = useState<number | null>(null);
    const [selectedDriverId, setSelectedDriverId] = useState<number | "">("");
    const [deleteId, setDeleteId] = useState<number | null>(null);

    /* ============ Data Fetching ============ */
    useEffect(() => { fetchAll(); }, []);
    useEffect(() => { if (mainTab === 'planning') fetchDeliveries(); }, [planningDate, mainTab]);

    const fetchAll = async () => {
        try {
            setLoading(true);
            const [assignRes, statsRes, custRes, prodRes, driverRes] = await Promise.all([
                assignmentAPI.list(),
                assignmentAPI.stats(),
                api.get("/users/?role=customer"),
                api.get("/products/?page_size=1000"),
                api.get("/users/?role=delivery"),
            ]);
            setAssignments(Array.isArray(assignRes.data) ? assignRes.data : assignRes.data.results || []);
            setStats(statsRes.data);
            setCustomers(Array.isArray(custRes.data) ? custRes.data : custRes.data.results || []);
            setProducts(Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.results || []);
            setDrivers(Array.isArray(driverRes.data) ? driverRes.data : driverRes.data.results || []);
        } catch { showToast("error", "Veriler yüklenirken hata oluştu"); }
        finally { setLoading(false); }
    };

    const fetchDeliveries = async () => {
        try {
            const res = await deliveryAPI.byDate(planningDate);
            setDeliveries(Array.isArray(res.data) ? res.data : res.data.results || []);
            setRouteResult(null);
            setSelectedDeliveries([]);
        } catch { /* no deliveries for this date */ setDeliveries([]); }
    };

    /* ============ Helpers ============ */
    const showToast = (type: ToastType, message: string) => {
        setToasts(p => [...p, { id: Date.now().toString(), type, message }]);
    };
    const removeToast = (id: string) => setToasts(p => p.filter(t => t.id !== id));

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    };

    /* --- Unscheduled assignments (status=PLANNED and no delivery) --- */
    const unscheduledAssignments = useMemo(() => {
        let list = assignments.filter(a => a.status === 'PLANNED' && !a.delivery_info?.scheduled_date);
        if (searchUnscheduled) {
            const t = searchUnscheduled.toLowerCase();
            list = list.filter(a =>
                a.customer?.first_name?.toLowerCase().includes(t) ||
                a.customer?.last_name?.toLowerCase().includes(t) ||
                a.customer?.username?.toLowerCase().includes(t) ||
                a.product?.name?.toLowerCase().includes(t) ||
                a.product?.model_code?.toLowerCase().includes(t)
            );
        }
        return list;
    }, [assignments, searchUnscheduled]);

    /* --- Planning deliveries filtered by search --- */
    const filteredDeliveries = useMemo(() => {
        if (!searchPlanning) return deliveries;
        const t = searchPlanning.toLowerCase();
        return deliveries.filter(d =>
            d.customer_name?.toLowerCase().includes(t) ||
            d.product_name?.toLowerCase().includes(t) ||
            d.customer_address?.toLowerCase().includes(t)
        );
    }, [deliveries, searchPlanning]);

    /* ============ Actions ============ */

    /* --- New Sale --- */
    const handleCreateAssignment = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await assignmentAPI.create({
                customer_id: selectedCustomer, product_id: selectedProduct,
                assigned_at: assignedAt, quantity, notes, status: 'PLANNED'
            });
            showToast("success", "Ürün satışı kaydedildi");
            setNewSaleModal(false);
            resetSaleForm();
            fetchAll();
        } catch (err: any) {
            showToast("error", err.response?.data?.detail || "Bir hata oluştu");
        } finally { setSubmitting(false); }
    };

    const resetSaleForm = () => {
        setSelectedCustomer(""); setSelectedProduct("");
        setAssignedAt(new Date().toISOString().split("T")[0]);
        setNotes(""); setQuantity(1);
    };

    /* --- Schedule Single --- */
    const openScheduleModal = (assignmentId: number) => {
        setScheduleAssignmentId(assignmentId);
        setScheduleDate(new Date().toISOString().split("T")[0]);
        setScheduleModal(true);
    };

    const handleScheduleSingle = async () => {
        if (!scheduleAssignmentId || !scheduleDate) return;
        setSubmitting(true);
        try {
            await assignmentAPI.scheduleDelivery(scheduleAssignmentId, scheduleDate);
            showToast("success", "Teslimat tarihi belirlendi");
            setScheduleModal(false);
            fetchAll();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || "Tarihleme başarısız");
        } finally { setSubmitting(false); }
    };

    /* --- Batch Schedule --- */
    const handleBatchSchedule = async () => {
        if (!selectedUnscheduled.length || !scheduleDate) return;
        setSubmitting(true);
        try {
            await assignmentAPI.batchSchedule(selectedUnscheduled, scheduleDate);
            showToast("success", `${selectedUnscheduled.length} atama planlandı`);
            setBatchScheduleModal(false);
            setSelectedUnscheduled([]);
            fetchAll();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || "Toplu planlama başarısız");
        } finally { setSubmitting(false); }
    };

    /* --- Optimize Route --- */
    const handleOptimize = async () => {
        if (!selectedDeliveries.length) {
            showToast("error", "Lütfen en az bir teslimat seçin");
            return;
        }
        setOptimizing(true);
        try {
            const res = await deliveryRouteAPI.optimize({
                delivery_ids: selectedDeliveries, date: planningDate
            });
            setRouteResult(res.data);
            showToast("success", `Rota optimize edildi: ${res.data.stop_count} durak, ${res.data.total_distance_km} km`);
            if (res.data.warnings?.no_coordinates?.length) {
                showToast("error", `${res.data.warnings.no_coordinates.length} teslimatın koordinat bilgisi yok`);
            }
        } catch (err: any) {
            showToast("error", err.response?.data?.error || "Rota optimizasyonu başarısız");
        } finally { setOptimizing(false); }
    };

    /* --- Assign Driver --- */
    const handleAssignDriver = async () => {
        if (!selectedDriverId || !selectedDeliveries.length) return;
        setSubmitting(true);
        try {
            const res = await deliveryAPI.assignDriver(selectedDeliveries, Number(selectedDriverId));
            showToast("success", res.data.message);
            setDriverModal(false);
            setSelectedDriverId("");
            fetchDeliveries();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || "Atama başarısız");
        } finally { setSubmitting(false); }
    };

    /* --- Delete --- */
    const handleDelete = async () => {
        if (!deleteId) return;
        setSubmitting(true);
        try {
            await assignmentAPI.delete(deleteId);
            showToast("success", "Atama silindi");
            setDeleteModal(false);
            setDeleteId(null);
            fetchAll();
        } catch { showToast("error", "Silme başarısız"); }
        finally { setSubmitting(false); }
    };

    /* --- Selection helpers --- */
    const toggleUnscheduled = (id: number) => {
        setSelectedUnscheduled(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    };
    const toggleAllUnscheduled = () => {
        setSelectedUnscheduled(p => p.length === unscheduledAssignments.length ? [] : unscheduledAssignments.map(a => a.id));
    };
    const toggleDelivery = (id: number) => {
        setSelectedDeliveries(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    };
    const toggleAllDeliveries = () => {
        setSelectedDeliveries(p => p.length === filteredDeliveries.length ? [] : filteredDeliveries.map(d => d.id));
    };

    /* ============ Render ============ */
    if (loading) {
        return (
            <div className="flex bg-gray-50 min-h-screen">
                <Sidebar />
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="animate-spin text-blue-600" size={40} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex bg-gray-50 min-h-screen">
            <Sidebar />
            <ToastContainer toasts={toasts} onRemove={removeToast} />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* ===== HEADER ===== */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="px-8 py-5 flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <Package className="text-blue-600" /> Satış ve Ürün Atama
                            </h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Müşterilere satılan ürünleri yönetin, teslimat planı oluşturun.
                            </p>
                        </div>
                        <button onClick={() => setNewSaleModal(true)}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
                            <Plus size={18} /> Yeni Satış
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-[1920px] mx-auto space-y-6">

                        {/* ===== KPI CARDS ===== */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {[
                                { label: "Tarihi Belirlenmemiş", value: stats.planned, color: "blue", icon: <Calendar size={20} /> },
                                { label: "Teslimat Planlanmış", value: stats.scheduled, color: "orange", icon: <Truck size={20} /> },
                                { label: "Yolda", value: stats.out_for_delivery, color: "purple", icon: <Navigation size={20} /> },
                                { label: "Tamamlanan", value: stats.delivered, color: "green", icon: <CheckCircle size={20} /> },
                            ].map((card) => (
                                <div key={card.label} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500">{card.label}</p>
                                            <h3 className="text-2xl font-bold text-gray-900 mt-1">{card.value}</h3>
                                        </div>
                                        <div className={`p-2 bg-${card.color}-50 text-${card.color}-600 rounded-lg`}>
                                            {card.icon}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ===== MAIN TABS ===== */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="border-b border-gray-200">
                                <div className="flex items-center justify-between px-6 py-4">
                                    <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                                        <button onClick={() => setMainTab('unscheduled')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mainTab === 'unscheduled' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                                            Tarihi Belirlenmemiş ({unscheduledAssignments.length})
                                        </button>
                                        <button onClick={() => setMainTab('planning')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mainTab === 'planning' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                                            Teslimat Planlaması
                                        </button>
                                    </div>

                                    {/* Search + Actions */}
                                    <div className="flex items-center gap-3">
                                        {mainTab === 'unscheduled' && selectedUnscheduled.length > 0 && (
                                            <button onClick={() => { setScheduleDate(new Date().toISOString().split("T")[0]); setBatchScheduleModal(true); }}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                <Calendar size={16} /> Seçilenlere Tarih Ata ({selectedUnscheduled.length})
                                            </button>
                                        )}
                                        {mainTab === 'planning' && selectedDeliveries.length > 0 && (
                                            <div className="flex gap-2">
                                                <button onClick={handleOptimize} disabled={optimizing}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                                    {optimizing ? <Loader2 className="animate-spin" size={16} /> : <Route size={16} />}
                                                    Rota Optimize Et ({selectedDeliveries.length})
                                                </button>
                                                <button onClick={() => { setSelectedDriverId(""); setDriverModal(true); }}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                    <UserCheck size={16} /> Teslimatçıya Ata
                                                </button>
                                            </div>
                                        )}
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input type="text"
                                                placeholder="Müşteri veya ürün ara..."
                                                value={mainTab === 'unscheduled' ? searchUnscheduled : searchPlanning}
                                                onChange={(e) => mainTab === 'unscheduled' ? setSearchUnscheduled(e.target.value) : setSearchPlanning(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm" />
                                        </div>
                                    </div>
                                </div>

                                {/* Date picker for planning tab */}
                                {mainTab === 'planning' && (
                                    <div className="px-6 pb-4 flex items-center gap-4">
                                        <label className="text-sm font-medium text-gray-600">Teslimat Tarihi:</label>
                                        <input type="date" value={planningDate} onChange={(e) => setPlanningDate(e.target.value)}
                                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                        <span className="text-sm text-gray-500">
                                            {deliveries.length} teslimat bulundu
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* ===== TAB 1: UNSCHEDULED TABLE ===== */}
                            {mainTab === 'unscheduled' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-3 w-10">
                                                    <input type="checkbox" checked={selectedUnscheduled.length === unscheduledAssignments.length && unscheduledAssignments.length > 0}
                                                        onChange={toggleAllUnscheduled} className="rounded border-gray-300" />
                                                </th>
                                                <th className="px-6 py-3">Müşteri</th>
                                                <th className="px-6 py-3">Ürün</th>
                                                <th className="px-6 py-3">Satış Tarihi</th>
                                                <th className="px-6 py-3">Durum</th>
                                                <th className="px-6 py-3 text-right">İşlemler</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {unscheduledAssignments.length > 0 ? unscheduledAssignments.map(a => (
                                                <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <input type="checkbox" checked={selectedUnscheduled.includes(a.id)}
                                                            onChange={() => toggleUnscheduled(a.id)} className="rounded border-gray-300" />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{a.customer?.first_name} {a.customer?.last_name}</div>
                                                        <div className="text-xs text-gray-500">{a.customer?.username}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{a.product?.name}</div>
                                                        <div className="text-xs text-gray-500">{a.product?.model_code} • {a.quantity} Adet</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500">{formatDate(a.assigned_at)}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-yellow-50 text-yellow-700 border-yellow-200">
                                                            Tarih Bekleniyor
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => openScheduleModal(a.id)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 font-medium text-xs transition-colors">
                                                                <Calendar size={14} /> Tarih Belirle
                                                            </button>
                                                            <button onClick={() => { setDeleteId(a.id); setDeleteModal(true); }}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Tüm atamalara tarih belirlenmiş 🎉</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ===== TAB 2: PLANNING TABLE ===== */}
                            {mainTab === 'planning' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-3 w-10">
                                                    <input type="checkbox" checked={selectedDeliveries.length === filteredDeliveries.length && filteredDeliveries.length > 0}
                                                        onChange={toggleAllDeliveries} className="rounded border-gray-300" />
                                                </th>
                                                <th className="px-6 py-3">Sıra</th>
                                                <th className="px-6 py-3">Müşteri</th>
                                                <th className="px-6 py-3">Ürün</th>
                                                <th className="px-6 py-3">Adres</th>
                                                <th className="px-6 py-3">Durum</th>
                                                <th className="px-6 py-3">Teslimatçı</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredDeliveries.length > 0 ? filteredDeliveries.map(d => (
                                                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <input type="checkbox" checked={selectedDeliveries.includes(d.id)}
                                                            onChange={() => toggleDelivery(d.id)} className="rounded border-gray-300" />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                                                            {d.delivery_order || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{d.customer_name}</div>
                                                        <div className="text-xs text-gray-500">{d.customer_phone}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{d.product_name}</div>
                                                        <div className="text-xs text-gray-500">{d.product_model_code} • {d.quantity} Adet</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-gray-600 max-w-xs truncate" title={d.customer_address}>
                                                            <MapPin size={12} className="inline mr-1" />{d.customer_address || 'Adres yok'}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${d.status === 'WAITING' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                                                            d.status === 'OUT_FOR_DELIVERY' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                d.status === 'DELIVERED' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                    'bg-red-50 text-red-700 border-red-200'
                                                            }`}>{d.status_display}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-600">
                                                        {d.driver_name || <span className="text-gray-400">Atanmadı</span>}
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                                    Bu tarihte planlanan teslimat bulunmuyor
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* ===== ROUTE RESULT PANEL ===== */}
                        {routeResult && mainTab === 'planning' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 bg-green-50">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <Route size={20} className="text-green-600" /> Optimize Edilmiş Rota
                                    </h3>
                                </div>
                                <div className="p-6">
                                    {/* KPIs */}
                                    <div className="grid grid-cols-3 gap-4 mb-6">
                                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                                            <p className="text-sm text-blue-600 font-medium">Toplam Mesafe</p>
                                            <p className="text-2xl font-bold text-blue-800">{routeResult.total_distance_km} km</p>
                                        </div>
                                        <div className="bg-orange-50 rounded-xl p-4 text-center">
                                            <p className="text-sm text-orange-600 font-medium">Tahmini Süre</p>
                                            <p className="text-2xl font-bold text-orange-800">
                                                {Math.floor(routeResult.total_duration_min / 60)} saat {routeResult.total_duration_min % 60} dk
                                            </p>
                                        </div>
                                        <div className="bg-green-50 rounded-xl p-4 text-center">
                                            <p className="text-sm text-green-600 font-medium">Durak Sayısı</p>
                                            <p className="text-2xl font-bold text-green-800">{routeResult.stop_count}</p>
                                        </div>
                                    </div>

                                    {/* Route Stops */}
                                    <div className="space-y-2">
                                        {routeResult.stops.map((stop, idx) => (
                                            <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                                                    {stop.stop_order}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900">{stop.customer_name}</p>
                                                    <p className="text-xs text-gray-500">{stop.product_name}</p>
                                                </div>
                                                <div className="text-right text-sm">
                                                    <p className="text-gray-700 font-medium">{stop.distance_from_previous_km} km</p>
                                                    <p className="text-xs text-gray-500">{stop.duration_from_previous_min} dk</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                {/* ===================== MODALS ===================== */}

                {/* New Sale Modal */}
                {newSaleModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">Yeni Satış Kaydı</h3>
                                <button onClick={() => setNewSaleModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>
                            <form onSubmit={handleCreateAssignment} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri</label>
                                    <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(Number(e.target.value))} required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
                                        <option value="">Seçiniz</option>
                                        {customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.username})</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ürün</label>
                                    <select value={selectedProduct} onChange={(e) => setSelectedProduct(Number(e.target.value))} required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
                                        <option value="">Seçiniz</option>
                                        {products.map(p => <option key={p.id} value={p.id}>{p.name} - {p.model_code || 'Kodsuz'} (Stok: {p.stock || 0})</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Satış Tarihi</label>
                                        <input type="date" value={assignedAt} onChange={(e) => setAssignedAt(e.target.value)} required
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Adet</label>
                                        <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Varsa notlarınız..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none min-h-[80px]" />
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setNewSaleModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">İptal</button>
                                    <button type="submit" disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : "Kaydet"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Schedule Single Modal */}
                {scheduleModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">Teslimat Tarihi Belirle</h3>
                                <button onClick={() => setScheduleModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tarih <span className="text-red-500">*</span></label>
                                    <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setScheduleModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">İptal</button>
                                    <button onClick={handleScheduleSingle} disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : "Planla"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Batch Schedule Modal */}
                {batchScheduleModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">Toplu Tarih Atama</h3>
                                <button onClick={() => setBatchScheduleModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                                    <span className="font-bold">{selectedUnscheduled.length}</span> atama için teslimat tarihi belirlenecek.
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Teslimat Tarihi <span className="text-red-500">*</span></label>
                                    <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setBatchScheduleModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">İptal</button>
                                    <button onClick={handleBatchSchedule} disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : "Tümünü Planla"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Assign Driver Modal */}
                {driverModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">Teslimatçıya Ata</h3>
                                <button onClick={() => setDriverModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800">
                                    <span className="font-bold">{selectedDeliveries.length}</span> teslimat atanacak.
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
                                    <button onClick={() => setDriverModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">İptal</button>
                                    <button onClick={handleAssignDriver} disabled={submitting || !selectedDriverId}
                                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : "Ata"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Modal */}
                {deleteModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                            <div className="p-6 text-center">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Atamayı Sil?</h3>
                                <p className="text-gray-500 text-sm mb-6">Bu işlem geri alınamaz.</p>
                                <div className="flex gap-3">
                                    <button onClick={() => setDeleteModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">İptal</button>
                                    <button onClick={handleDelete} disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : "Sil"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
