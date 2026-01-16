import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import * as Lucide from "lucide-react";
import Sidebar from "../components/Sidebar";
import { ToastContainer, type ToastType } from "../components/Toast";
import api, { installmentAPI, productAPI, customerAPI } from "../services/api";

const {
    CreditCard = () => <span>💳</span>,
    ChevronRight = () => <span>→</span>,
    Search = () => <span>🔍</span>,
    Filter = () => <span>⚙</span>,
    CheckCircle = () => <span>✓</span>,
    Clock = () => <span>⏰</span>,
    AlertTriangle = () => <span>⚠</span>,
    XCircle = () => <span>✕</span>,
    Loader2 = () => <span>↻</span>,
    RefreshCw = () => <span>↺</span>,
    Plus = () => <span>+</span>,
} = Lucide as any;

interface InstallmentPlan {
    id: number;
    customer: number;
    customer_name: string;
    product: number;
    product_name: string;
    total_amount: string;
    down_payment: string;
    installment_count: number;
    start_date: string;
    status: string;
    status_display: string;
    remaining_amount: string;
    paid_amount: string;
    progress_percentage: number;
    created_at: string;
}

interface Installment {
    id: number;
    installment_number: number;
    amount: string;
    due_date: string;
    payment_date: string | null;
    status: string;
    status_display: string;
    is_overdue: boolean;
    days_until_due: number;
}

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

export default function InstallmentPlansPage() {
    const [plans, setPlans] = useState<InstallmentPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedPlan, setSelectedPlan] = useState<InstallmentPlan | null>(null);
    const [installments, setInstallments] = useState<Installment[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [approvingId, setApprovingId] = useState<number | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();

    // Creation Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [customers, setCustomers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [createForm, setCreateForm] = useState({
        customer: "",
        product: "",
        down_payment: "",
        installment_count: 9,
        start_date: new Date().toISOString().split('T')[0]
    });
    const [creating, setCreating] = useState(false);

    // Derived state for Total Amount
    const selectedProductPrice = useMemo(() => {
        const prod = products.find(p => p.id === Number(createForm.product));
        return prod ? parseFloat(prod.price) : 0;
    }, [createForm.product, products]);

    const fetchDropdowns = async () => {
        try {
            const [custRes, prodRes] = await Promise.all([
                customerAPI.list(),
                productAPI.list()
            ]);
            setCustomers(custRes.data.results || custRes.data);
            setProducts(prodRes.data.results || prodRes.data);
        } catch (error) {
            console.error("Error fetching dropdowns:", error);
            showToast("error", "Müşteri ve ürün listesi alınamadı");
        }
    };

    const handleOpenCreateModal = () => {
        setIsCreateModalOpen(true);
        fetchDropdowns();
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);

        try {
            const payload = {
                customer: Number(createForm.customer),
                product: Number(createForm.product),
                total_amount: selectedProductPrice,
                down_payment: Number(createForm.down_payment) || 0,
                installment_count: Number(createForm.installment_count),
                start_date: createForm.start_date
            };

            await installmentAPI.createPlan(payload);
            showToast("success", "Taksit planı başarıyla oluşturuldu");
            setIsCreateModalOpen(false);
            setCreateForm({
                customer: "", product: "", down_payment: "", installment_count: 9, start_date: new Date().toISOString().split('T')[0]
            });
            fetchPlans();
        } catch (error: any) {
            console.error("Create plan error:", error);
            showToast("error", error.response?.data?.detail || "Plan oluşturulurken hata oluştu");
        } finally {
            setCreating(false);
        }
    };

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const filters = statusFilter !== "all" ? { status: statusFilter } : undefined;
            const response = await installmentAPI.getAllPlans(filters);
            // Handle pagination (DRF usually returns { results: [...] })
            const data = response.data;
            setPlans(Array.isArray(data) ? data : (data.results || []));
        } catch (error: any) {
            console.error("Failed to fetch plans:", error);
            showToast("error", "Taksit planları yüklenemedi");
        } finally {
            setLoading(false);
        }
    };

    const fetchInstallments = async (planId: number) => {
        setDetailLoading(true);
        try {
            const response = await installmentAPI.getPlanInstallments(planId);
            // Handle pagination
            const data = response.data;
            setInstallments(Array.isArray(data) ? data : (data.results || []));
        } catch (error: any) {
            console.error("Failed to fetch installments:", error);
            showToast("error", "Taksitler yüklenemedi");
        } finally {
            setDetailLoading(false);
        }
    };

    useEffect(() => {
        fetchPlans();
    }, [statusFilter]);

    const showToast = (type: ToastType, message: string) => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, type, message }]);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const handleViewDetail = (plan: InstallmentPlan) => {
        setSearchParams({ planId: plan.id.toString() });
    };

    const handleBackToList = () => {
        setSearchParams({});
        setSelectedPlan(null);
        setInstallments([]);
    };

    useEffect(() => {
        const planId = searchParams.get("planId");
        if (planId) {
            const loadDetail = async () => {
                // Eğer zaten yüklüyse tekrar yükleme
                if (selectedPlan && selectedPlan.id === Number(planId)) return;

                setLoading(true);
                try {
                    // Plan detayını çek (listeden bağımsız)
                    const response = await installmentAPI.getPlan(Number(planId));
                    setSelectedPlan(response.data);
                    // Taksitleri çek
                    await fetchInstallments(Number(planId));
                } catch (error) {
                    console.error("Plan detay hatası:", error);
                    showToast("error", "Plan detayları yüklenemedi");
                    setSearchParams({}); // Hatada listeye dön
                } finally {
                    setLoading(false);
                }
            };
            loadDetail();
        } else {
            // URL parametresi yoksa detaydan çık
            setSelectedPlan(null);
            setInstallments([]);
        }
    }, [searchParams]);

    const handleApprovePayment = async (installmentId: number) => {
        setApprovingId(installmentId);
        try {
            await installmentAPI.adminApprovePayment(installmentId);
            showToast("success", "Ödeme onaylandı");
            if (selectedPlan) {
                fetchInstallments(selectedPlan.id);
                fetchPlans(); // Refresh list to update progress
            }
        } catch (error: any) {
            console.error("Failed to approve payment:", error);
            showToast("error", "Ödeme onaylanamadı");
        } finally {
            setApprovingId(null);
        }
    };

    const filteredPlans = useMemo(() => {
        return plans.filter(plan => {
            const matchesSearch =
                plan.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                plan.product_name.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesSearch;
        });
    }, [plans, searchTerm]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "active": return <Clock className="w-4 h-4 text-blue-500" />;
            case "completed": return <CheckCircle className="w-4 h-4 text-green-500" />;
            case "cancelled": return <XCircle className="w-4 h-4 text-gray-500" />;
            default: return null;
        }
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case "active": return "bg-blue-100 text-blue-800";
            case "completed": return "bg-green-100 text-green-800";
            case "cancelled": return "bg-gray-100 text-gray-800";
            case "pending": return "bg-yellow-100 text-yellow-800";
            case "customer_confirmed": return "bg-purple-100 text-purple-800";
            case "paid": return "bg-green-100 text-green-800";
            case "overdue": return "bg-red-100 text-red-800";
            default: return "bg-gray-100 text-gray-800";
        }
    };

    const formatCurrency = (amount: string) => {
        return parseFloat(amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + " ₺";
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
    };

    // Detail View
    if (selectedPlan) {
        return (
            <div className="flex min-h-screen bg-gray-100">
                <Sidebar />
                <main className="flex-1 p-6">
                    <button
                        onClick={handleBackToList}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
                    >
                        ← Listeye Dön
                    </button>

                    <div className="bg-white rounded-xl shadow-md p-6 mb-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{selectedPlan.product_name}</h1>
                                <p className="text-gray-600">Müşteri: {selectedPlan.customer_name}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(selectedPlan.status)}`}>
                                {selectedPlan.status_display}
                            </span>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-sm text-gray-500">Toplam</div>
                                <div className="text-lg font-bold">{formatCurrency(selectedPlan.total_amount)}</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-sm text-gray-500">Peşinat</div>
                                <div className="text-lg font-bold">{formatCurrency(selectedPlan.down_payment)}</div>
                            </div>
                            <div className="text-center p-4 bg-green-50 rounded-lg">
                                <div className="text-sm text-green-600">Ödenen</div>
                                <div className="text-lg font-bold text-green-700">{formatCurrency(selectedPlan.paid_amount)}</div>
                            </div>
                            <div className="text-center p-4 bg-red-50 rounded-lg">
                                <div className="text-sm text-red-600">Kalan</div>
                                <div className="text-lg font-bold text-red-700">{formatCurrency(selectedPlan.remaining_amount)}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all duration-500"
                                    style={{ width: `${selectedPlan.progress_percentage}%` }}
                                />
                            </div>
                            <span className="text-lg font-bold">{selectedPlan.progress_percentage}%</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-md p-6">
                        <h2 className="text-xl font-bold mb-4">Taksitler</h2>

                        {detailLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Taksit No</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tutar</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Vade Tarihi</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ödeme Tarihi</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Durum</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {installments.map((inst) => (
                                        <tr key={inst.id} className={inst.is_overdue ? "bg-red-50" : ""}>
                                            <td className="px-4 py-4">
                                                <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full font-bold text-sm">
                                                    {inst.installment_number}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 font-medium">{formatCurrency(inst.amount)}</td>
                                            <td className="px-4 py-4">{formatDate(inst.due_date)}</td>
                                            <td className="px-4 py-4">{inst.payment_date ? formatDate(inst.payment_date) : "-"}</td>
                                            <td className="px-4 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(inst.status)}`}>
                                                    {inst.status_display}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                {inst.status === "customer_confirmed" && (
                                                    <button
                                                        onClick={() => handleApprovePayment(inst.id)}
                                                        disabled={approvingId === inst.id}
                                                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                                                    >
                                                        {approvingId === inst.id ? "..." : "Onayla"}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <ToastContainer toasts={toasts} onRemove={removeToast} />
                </main>
            </div>
        );
    }

    // List View
    return (
        <div className="flex min-h-screen bg-gray-100">
            <Sidebar />
            <main className="flex-1 p-6">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <CreditCard className="w-8 h-8 text-gray-700" />
                        <h1 className="text-2xl font-bold text-gray-900">Taksit Yönetimi</h1>
                    </div>
                    <button
                        onClick={fetchPlans}
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Yenile
                    </button>
                    <button
                        onClick={handleOpenCreateModal}
                        className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                    >
                        <Plus className="w-4 h-4" />
                        Yeni Plan Oluştur
                    </button>
                </div>

                {/* Filters */}
                <div className="flex gap-4 mb-6">
                    <div className="flex-1 relative">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Müşteri veya ürün ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black"
                    >
                        <option value="all">Tüm Durumlar</option>
                        <option value="active">Aktif</option>
                        <option value="completed">Tamamlanmış</option>
                        <option value="cancelled">İptal Edilmiş</option>
                    </select>
                </div>

                {/* Plans Table */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                        </div>
                    ) : filteredPlans.length === 0 ? (
                        <div className="text-center py-12">
                            <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">Henüz taksit planı bulunmuyor</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">Müşteri</th>
                                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">Ürün</th>
                                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">Toplam</th>
                                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">Kalan</th>
                                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">İlerleme</th>
                                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">Durum</th>
                                    <th className="px-6 py-4 text-right text-sm font-medium text-gray-600">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredPlans.map((plan) => (
                                    <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium">{plan.customer_name}</td>
                                        <td className="px-6 py-4 text-gray-600">{plan.product_name}</td>
                                        <td className="px-6 py-4">{formatCurrency(plan.total_amount)}</td>
                                        <td className="px-6 py-4 text-red-600 font-medium">{formatCurrency(plan.remaining_amount)}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-500"
                                                        style={{ width: `${plan.progress_percentage}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium">{plan.progress_percentage}%</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(plan.status)}`}>
                                                {getStatusIcon(plan.status)}
                                                {plan.status_display}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleViewDetail(plan)}
                                                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                                            >
                                                Detay
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Create Modal */}
                {isCreateModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">Yeni Taksit Planı</h3>
                                <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri</label>
                                    <select
                                        required
                                        className="w-full border-gray-300 rounded-lg focus:ring-black focus:border-black"
                                        value={createForm.customer}
                                        onChange={e => setCreateForm({ ...createForm, customer: e.target.value })}
                                    >
                                        <option value="">Seçiniz</option>
                                        {customers.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.email})</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ürün</label>
                                    <select
                                        required
                                        className="w-full border-gray-300 rounded-lg focus:ring-black focus:border-black"
                                        value={createForm.product}
                                        onChange={e => setCreateForm({ ...createForm, product: e.target.value })}
                                    >
                                        <option value="">Seçiniz</option>
                                        {products.map((p: any) => (
                                            <option key={p.id} value={p.id}>{p.name} - {p.price} TL</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Toplam Tutar</label>
                                        <input
                                            type="text"
                                            disabled
                                            value={`${selectedProductPrice} TL`}
                                            className="w-full bg-gray-100 border-gray-300 rounded-lg text-gray-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Peşinat</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max={selectedProductPrice}
                                            required
                                            className="w-full border-gray-300 rounded-lg focus:ring-black focus:border-black"
                                            value={createForm.down_payment}
                                            onChange={e => setCreateForm({ ...createForm, down_payment: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Taksit Sayısı</label>
                                        <select
                                            className="w-full border-gray-300 rounded-lg focus:ring-black focus:border-black"
                                            value={createForm.installment_count}
                                            onChange={e => setCreateForm({ ...createForm, installment_count: Number(e.target.value) })}
                                        >
                                            {[3, 6, 9, 12, 18, 24].map(n => (
                                                <option key={n} value={n}>{n} Taksit</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç Tarihi</label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full border-gray-300 rounded-lg focus:ring-black focus:border-black"
                                            value={createForm.start_date}
                                            onChange={e => setCreateForm({ ...createForm, start_date: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateModalOpen(false)}
                                        className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={creating}
                                        className="flex-1 py-2.5 bg-black text-white rounded-xl hover:bg-gray-800 font-medium disabled:opacity-50"
                                    >
                                        {creating ? 'Oluşturuluyor...' : 'Planı Oluştur'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <ToastContainer toasts={toasts} onRemove={removeToast} />
            </main>
        </div>
    );
}
