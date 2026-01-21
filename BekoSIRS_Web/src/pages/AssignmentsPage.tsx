import React, { useEffect, useState, useMemo } from "react";
import * as Lucide from "lucide-react";
import Sidebar from "../components/Sidebar";
import { ToastContainer, type ToastType } from "../components/Toast";
import api from "../services/api";

const {
    Package = () => <span>📦</span>,
    Users = () => <span>👥</span>,
    Plus = () => <span>+</span>,
    Search = () => <span>🔍</span>,
    Calendar = () => <span>📅</span>,
    Shield = () => <span>🛡️</span>,
    X = () => <span>✕</span>,
    Trash2 = () => <span>🗑</span>,
    Loader2 = () => <span>↻</span>,
    AlertCircle = () => <span>⚠</span>,
    CheckCircle = () => <span>✓</span>,
    Truck = () => <span>🚚</span>,
} = Lucide as any;

interface Customer {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    address?: string;
    formatted_address?: string;
}

interface Product {
    id: number;
    name: string;
    brand: string;
    model_code?: string;
    stock?: number;
    category?: { name: string };
}

interface ProductAssignment {
    id: number;
    customer: Customer;
    product: Product;
    assigned_at: string;
    status: string;
    status_display: string;
    quantity: number;
    notes?: string;
    delivery_info?: {
        id: number;
        status: string;
        status_display: string;
        scheduled_date: string;
        time_window_start?: string;
        time_window_end?: string;
    };
}

export default function AssignmentsPage() {
    const [assignments, setAssignments] = useState<ProductAssignment[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Stats state
    const [stats, setStats] = useState({
        planned: 0,
        scheduled: 0,
        out_for_delivery: 0,
        delivered: 0
    });

    // Tab state
    const [activeTab, setActiveTab] = useState<'PLANNED' | 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED'>('PLANNED');

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [selectedCustomer, setSelectedCustomer] = useState<number | "">("");
    const [selectedProduct, setSelectedProduct] = useState<number | "">("");
    const [assignedAt, setAssignedAt] = useState(new Date().toISOString().split("T")[0]);
    const [notes, setNotes] = useState("");
    const [quantity, setQuantity] = useState(1);

    // Scheduling state
    const [selectedAssignment, setSelectedAssignment] = useState<ProductAssignment | null>(null);
    const [deliveryDate, setDeliveryDate] = useState("");
    const [deliveryAddress, setDeliveryAddress] = useState("");

    // Toast
    const [toasts, setToasts] = useState<Array<{ id: string; type: ToastType; message: string }>>([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [assignmentsRes, statsRes, customersRes, productsRes] = await Promise.all([
                api.get("/assignments/"),
                api.get("/assignments/stats/"),
                api.get("/users/?role=customer"),
                api.get("/products/?page_size=1000"),
            ]);

            setAssignments(Array.isArray(assignmentsRes.data) ? assignmentsRes.data : assignmentsRes.data.results || []);
            setStats(statsRes.data);
            setCustomers(Array.isArray(customersRes.data) ? customersRes.data : customersRes.data.results || []);
            setProducts(Array.isArray(productsRes.data) ? productsRes.data : productsRes.data.results || []);
        } catch (error) {
            showToast("error", "Veriler yüklenirken hata oluştu");
        } finally {
            setLoading(false);
        }
    };

    const showToast = (type: ToastType, message: string) => {
        const id = Date.now().toString();
        setToasts((prev) => [...prev, { id, type, message }]);
    };

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const handleCreateAssignment = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post("/assignments/", {
                customer_id: selectedCustomer,
                product_id: selectedProduct,
                assigned_at: assignedAt,
                quantity: quantity,
                notes: notes,
                status: 'PLANNED'
            });
            showToast("success", "Ürün satışı kaydedildi");
            setModalOpen(false);
            resetForm();
            fetchData();
        } catch (error: any) {
            showToast("error", error.response?.data?.detail || error.message || "Bir hata oluştu");
        } finally {
            setSubmitting(false);
        }
    };

    const handleScheduleDelivery = async () => {
        if (!selectedAssignment || !deliveryDate) {
            showToast("error", "Tarih seçiniz");
            return;
        }

        setSubmitting(true);
        try {
            await api.post("/deliveries/", {
                assignment_id: selectedAssignment.id,
                scheduled_date: deliveryDate,
                address: deliveryAddress || selectedAssignment.customer.address || "Adres Girilmedi",
                notes: "Assignments page planlaması"
            });
            showToast("success", "Teslimat planlandı!");
            setScheduleModalOpen(false);
            fetchData();
        } catch (error: any) {
            showToast("error", error.response?.data?.error || "Planlama başarısız");
        } finally {
            setSubmitting(false);
        }
    };

    const openScheduleModal = (assignment: ProductAssignment) => {
        setSelectedAssignment(assignment);
        setDeliveryAddress(assignment.customer.formatted_address || assignment.customer.address || "");
        const today = new Date();
        setDeliveryDate(today.toISOString().split('T')[0]);
        setScheduleModalOpen(true);
    };

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = (id: number) => {
        setDeleteId(id);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;

        try {
            setDeleting(true);
            const res = await api.delete(`/assignments/${deleteId}/`);
            // Accept 200, 204
            if (res.status === 204 || res.status === 200) {
                showToast("success", "Atama silindi");
                fetchData();
            }
        } catch (error: any) {
            console.error("Delete error:", error);
            showToast("error", error.message || "Silme işlemi başarısız");
        } finally {
            setDeleting(false);
            setDeleteModalOpen(false);
            setDeleteId(null);
        }
    };

    const resetForm = () => {
        setSelectedCustomer("");
        setSelectedProduct("");
        setAssignedAt(new Date().toISOString().split("T")[0]);
        setNotes("");
        setQuantity(1);
    };

    const filteredAssignments = useMemo(() => {
        let filtered = assignments;

        // Tab filtering
        if (activeTab === 'PLANNED') {
            // Planlanacak sekmesinde: Statüsü PLANNED olanlar VE Henüz teslimat tarihi OLMAYANLAR
            // (delivery_info olabilir ama scheduled_date null ise henüz planlanmamış sayılır)
            filtered = filtered.filter(a => a.status === 'PLANNED' && !a.delivery_info?.scheduled_date);
        } else {
            // Diğer sekmeler (SCHEDULED, OUT_FOR_DELIVERY, DELIVERED)
            if (activeTab === 'SCHEDULED') {
                // Teslimat Bekleyen: Statüsü SCHEDULED olanlar VEYA PLANNED ama teslimat tarihi var
                filtered = filtered.filter(a => a.status === 'SCHEDULED' || (a.status === 'PLANNED' && a.delivery_info?.scheduled_date));
            } else {
                filtered = filtered.filter(a => a.status === activeTab);
            }
        }

        // Search filtering
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (o) =>
                    o.customer?.username?.toLowerCase().includes(term) ||
                    o.customer?.email?.toLowerCase().includes(term) ||
                    o.product?.name?.toLowerCase().includes(term)
            );
        }
        return filtered;
    }, [assignments, searchTerm, activeTab]);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    };

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
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="px-8 py-5 flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <Package className="text-blue-600" />
                                Satış ve Ürün Atama
                            </h1>
                            <p className="text-sm text-gray-500 mt-1">Müşterilere satılan ürünleri buradan yönetebilirsiniz.</p>
                        </div>
                        <button
                            onClick={() => setModalOpen(true)}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                        >
                            <Plus size={18} />
                            Yeni Satış
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-[1920px] mx-auto space-y-6">

                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Planlanacak</p>
                                        <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.planned}</h3>
                                    </div>
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                        <Calendar size={20} />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Teslimat Bekleyen</p>
                                        <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.scheduled}</h3>
                                    </div>
                                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                                        <Truck size={20} />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Yolda</p>
                                        <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.out_for_delivery}</h3>
                                    </div>
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                        <Users size={20} />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">Tamamlanan</p>
                                        <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.delivered}</h3>
                                    </div>
                                    <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                                        <CheckCircle size={20} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Filters & Tabs */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="border-b border-gray-200">
                                <div className="flex items-center justify-between px-6 py-4">
                                    <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                                        <button
                                            onClick={() => setActiveTab('PLANNED')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'PLANNED' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                                }`}
                                        >
                                            Planlanacak
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('SCHEDULED')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'SCHEDULED' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                                }`}
                                        >
                                            Teslimat Bekleyen
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('OUT_FOR_DELIVERY')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'OUT_FOR_DELIVERY' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                                }`}
                                        >
                                            Yolda
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('DELIVERED')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'DELIVERED' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                                }`}
                                        >
                                            Tamamlanan
                                        </button>
                                    </div>
                                    <div className="relative w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Müşteri veya ürün ara..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3">Müşteri</th>
                                            <th className="px-6 py-3">Ürün</th>
                                            <th className="px-6 py-3">Tarih</th>
                                            <th className="px-6 py-3">Durum</th>
                                            <th className="px-6 py-3 text-right">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredAssignments.length > 0 ? (
                                            filteredAssignments.map((assignment) => (
                                                <tr key={assignment.id} className="hover:bg-gray-50 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">
                                                            {assignment.customer?.first_name} {assignment.customer?.last_name}
                                                        </div>
                                                        <div className="text-xs text-gray-500">{assignment.customer?.username}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{assignment.product?.name}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {assignment.product?.model_code} • {assignment.quantity} Adet
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500">
                                                        {formatDate(assignment.assigned_at)}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${assignment.status === 'PLANNED' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                                                            assignment.status === 'SCHEDULED' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                assignment.status === 'OUT_FOR_DELIVERY' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                    'bg-green-50 text-green-700 border-green-200'
                                                            }`}>
                                                            {assignment.status_display}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {assignment.status === 'PLANNED' && (
                                                                <button
                                                                    onClick={() => openScheduleModal(assignment)}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 font-medium text-xs transition-colors"
                                                                >
                                                                    <Truck size={14} />
                                                                    Planla
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleDelete(assignment.id)}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                                    Kayıt bulunamadı
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </main>

                {/* New Assignment Modal */}
                {modalOpen && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">Yeni Satış Kaydı</h3>
                                <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleCreateAssignment} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri</label>
                                    <select
                                        value={selectedCustomer}
                                        onChange={(e) => setSelectedCustomer(Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        required
                                    >
                                        <option value="">Seçiniz</option>
                                        {customers.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.first_name} {c.last_name} ({c.username})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ürün</label>
                                    <select
                                        value={selectedProduct}
                                        onChange={(e) => setSelectedProduct(Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        required
                                    >
                                        <option value="">Seçiniz</option>
                                        {products.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} - {p.model_code || 'Kodsuz'} (Stok: {p.stock || 0})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Satış Tarihi</label>
                                        <input
                                            type="date"
                                            value={assignedAt}
                                            onChange={(e) => setAssignedAt(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Adet</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={quantity}
                                            onChange={(e) => setQuantity(Number(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            required
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-h-[80px]"
                                        placeholder="Varsa notlarınız..."
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
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : "Kaydet"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {scheduleModalOpen && selectedAssignment && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">Teslimat Planla</h3>
                                <button onClick={() => setScheduleModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="mb-4 p-3 bg-orange-50 border border-orange-100 rounded-lg text-sm text-orange-800">
                                    <span className="font-bold">{selectedAssignment.customer.first_name} {selectedAssignment.customer.last_name}</span> için <span className="font-bold">{selectedAssignment.product.name}</span> teslimatı planlanıyor.
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Teslimat Tarihi <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            value={deliveryDate}
                                            onChange={(e) => setDeliveryDate(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Teslimat Adresi</label>
                                        <textarea
                                            value={deliveryAddress}
                                            onChange={(e) => setDeliveryAddress(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all min-h-[80px]"
                                            placeholder="Adres giriniz..."
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-6">
                                    <button
                                        onClick={() => setScheduleModalOpen(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        onClick={handleScheduleDelivery}
                                        disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : "Planla"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {/* Delete Confirmation Modal */}
            {deleteModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Atamayı Sil?</h3>
                            <p className="text-gray-500 text-sm mb-6">
                                Bu işlem geri alınamaz. Bu satış atamasını silmek istediğinizden emin misiniz?
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
                                    {deleting ? <Loader2 className="animate-spin" size={18} /> : "Sil"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
