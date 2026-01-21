import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import * as Lucide from "lucide-react";
import { deliveryAPI } from "../services/api";
import type { Delivery, DeliveryStats } from "../types/delivery";
import Toast, { type ToastType } from "../components/Toast";

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

    // Toast
    const [toastMessage, setToastMessage] = useState("");
    const [toastType, setToastType] = useState<ToastType>("info");
    const [toastOpen, setToastOpen] = useState(false);

    useEffect(() => {
        fetchData();
        fetchStats();
    }, [dateFilter, statusFilter]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (dateFilter) params.date = dateFilter;
            if (statusFilter) params.status = statusFilter;

            const response = await deliveryAPI.list(params);

            // Handle paginated response
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

    const handleEdit = (delivery: Delivery) => {
        setSelectedDelivery(delivery);
        setModalOpen(true);
    };

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = (id: number) => {
        if (!id) return;
        setDeleteId(id);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;

        try {
            setDeleting(true);
            console.log("Sending DELETE request to API for ID:", deleteId);
            await deliveryAPI.delete(deleteId);
            console.log("DELETE request successful");
            showToast("Teslimat silindi", "success");
            fetchData();
            fetchStats();
            setDeleteModalOpen(false);
        } catch (error: any) {
            console.error("Delete error details:", error);
            const errorMessage = error.response?.data?.error || "Silme işlemi başarısız";
            showToast(errorMessage, "error");
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
            fetchData();
            fetchStats();
        } catch (error) {
            console.error("Update error:", error);
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

            if (response.data.success) {
                showToast(`Rota optimize edildi! Toplam: ${response.data.total_km.toFixed(1)} km`, "success");
                fetchData();
                setSelectedIds([]);
            }
        } catch (error: any) {
            console.error("Optimization error:", error);
            showToast(error.response?.data?.error || "Optimizasyon başarısız", "error");
        } finally {
            setOptimizing(false);
        }
    };

    const showToast = (message: string, type: ToastType) => {
        setToastMessage(message);
        setToastType(type);
        setToastOpen(true);
    };

    const handleRefresh = () => {
        fetchData();
        fetchStats();
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
                            <p className="text-sm text-gray-500 mt-1">Teslimat planlaması ve takibi</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleRefresh} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition" title="Yenile">
                                <Lucide.RefreshCw size={20} />
                            </button>
                            {/* Future: Add 'Create Delivery' button here if needed */}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-4 items-center">
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
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
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

                    {/* Content */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                                                            <Lucide.AlertTriangle size={10} /> Konum Eksik - Rota optimize edilemez
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">{delivery.scheduled_date}</div>
                                                    {delivery.eta_minutes && (
                                                        <div className="text-xs text-gray-500">Tahmini: {Math.round(delivery.eta_minutes)} dk</div>
                                                    )}
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
                </main>
            </div>

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
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
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
                                <select
                                    name="status"
                                    defaultValue={selectedDelivery.status}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    <option value="WAITING">Bekliyor</option>
                                    <option value="OUT_FOR_DELIVERY">Dağıtımda</option>
                                    <option value="DELIVERED">Teslim Edildi</option>
                                    <option value="FAILED">Başarısız</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Teslimat Tarihi</label>
                                <input
                                    type="date"
                                    name="scheduled_date"
                                    defaultValue={selectedDelivery.scheduled_date}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                                <textarea
                                    name="notes"
                                    defaultValue={selectedDelivery.notes || ''}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none min-h-[80px]"
                                    placeholder="Teslimat notları..."
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
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
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Lucide.AlertTriangle size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Teslimatı Sil?</h3>
                            <p className="text-gray-500 text-sm mb-6">
                                Bu işlem geri alınamaz. Teslimatı silmek istediğinizden emin misiniz?
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteModalOpen(false)}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    disabled={deleting}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {deleting ? <Lucide.Loader2 className="animate-spin" size={18} /> : "Sil"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
}
