import { useState, useEffect } from "react";
import { UserCheck, Search, Eye, Edit2, ArrowUpDown, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import Sidebar from "../components/Sidebar";
import ViewCustomerModal from "../components/ViewCustomerModal";
import EditCustomerModal from "../components/EditCustomerModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { customerService } from "../services/customerService";
import type { Customer, CustomerDetail } from "../types/customer";

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [ordering, setOrdering] = useState<"first_name" | "-first_name">("first_name");
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    
    // Delete Confirmation State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 10;
    const totalPages = Math.ceil(totalCount / pageSize);

    useEffect(() => {
        fetchCustomers();
    }, [ordering, currentPage]);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const response = await customerService.getCustomers({
                search: searchTerm,
                ordering,
                page: currentPage,
            });
            setCustomers(response.results);
            setTotalCount(response.count);
        } catch (error) {
            console.error("Error fetching customers:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        setCurrentPage(1);
        fetchCustomers();
    };

    const handleClearFilters = () => {
        setSearchTerm("");
        setOrdering("first_name");
        setCurrentPage(1);
        setTimeout(() => fetchCustomers(), 0);
    };

    const toggleOrdering = () => {
        setOrdering((prev) => (prev === "first_name" ? "-first_name" : "first_name"));
    };

    const handleView = async (customer: Customer) => {
        try {
            const details = await customerService.getCustomer(customer.id);
            setSelectedCustomer(details);
            setShowViewModal(true);
        } catch (error) {
            console.error("Error fetching customer details:", error);
        }
    };

    const handleEdit = async (customer: Customer) => {
        try {
            const details = await customerService.getCustomer(customer.id);
            setSelectedCustomer(details);
            setShowEditModal(true);
        } catch (error) {
            console.error("Error fetching customer details:", error);
        }
    };

    const handleEditSuccess = () => {
        fetchCustomers();
    };

    const handleDeleteClick = (customer: Customer) => {
        setCustomerToDelete(customer);
        setShowDeleteModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!customerToDelete) return;
        try {
            await customerService.deleteCustomer(customerToDelete.id);
            setShowDeleteModal(false);
            setCustomerToDelete(null);
            
            // Go back to previous page if it was the last item on current page
            if (customers.length === 1 && currentPage > 1) {
                setCurrentPage(prev => prev - 1);
            } else {
                fetchCustomers();
            }
        } catch (error) {
            console.error("Error deleting customer:", error);
            alert("Müşteri silinirken bir hata oluştu. Müşterinin ilişkili siparişleri/teslimatları olabilir.");
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen bg-gray-50">
                <Sidebar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-black mx-auto"></div>
                        <p className="text-gray-600 mt-4 text-lg">Müşteriler yükleniyor...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
                    <div className="max-w-7xl mx-auto px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <UserCheck size={28} className="text-blue-500" />
                                <h1 className="text-2xl font-bold text-gray-900">Müşteri Yönetimi</h1>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Hero Section */}
                <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
                    <div className="max-w-7xl mx-auto px-6 py-12">
                        <p className="text-gray-400 text-sm font-medium mb-2">KKTC ADRES YÖNETİMİ</p>
                        <h2 className="text-3xl font-bold mb-2">Müşteri Bilgilerini Yönetin</h2>
                        <p className="text-gray-300">
                            Müşteri iletişim ve adres bilgilerini görüntüleyin ve güncelleyin
                        </p>
                    </div>
                </div>

                <main className="max-w-7xl mx-auto w-full px-6 py-8">
                    {/* Filters */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                            <div className="relative flex-1 max-w-md">
                                <Search
                                    className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
                                    size={20}
                                />
                                <input
                                    type="text"
                                    placeholder="Telefon veya isim ile ara..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={toggleOrdering}
                                    className="px-4 py-3 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors flex items-center space-x-2"
                                >
                                    <ArrowUpDown size={18} />
                                    <span className="text-sm font-medium">
                                        {ordering === "first_name" ? "A→Z" : "Z→A"}
                                    </span>
                                </button>

                                <button
                                    onClick={handleSearch}
                                    className="bg-black text-white px-6 py-3 rounded-full hover:bg-gray-800 transition-all font-medium"
                                >
                                    Ara
                                </button>

                                <button
                                    onClick={handleClearFilters}
                                    className="px-4 py-3 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium"
                                >
                                    Temizle
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Customers Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Ad Soyad
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Telefon
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            E-posta
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            İlçe / Mahalle
                                        </th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Aksiyonlar
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {customers.length > 0 ? (
                                        customers.map((customer) => (
                                            <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                                                            <span className="text-white font-bold text-sm">
                                                                {(customer.full_name || customer.username).charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <span className="font-medium text-gray-900">
                                                            {customer.full_name || customer.username}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {customer.phone_number || "-"}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{customer.email}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    {customer.district_name && customer.area_name
                                                        ? `${customer.district_name} / ${customer.area_name}`
                                                        : "-"}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center space-x-2">
                                                        <button
                                                            onClick={() => handleView(customer)}
                                                            className="p-2 hover:bg-blue-50 rounded-lg transition-colors group"
                                                            title="Görüntüle"
                                                        >
                                                            <Eye size={18} className="text-gray-600 group-hover:text-blue-600" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEdit(customer)}
                                                            className="p-2 hover:bg-green-50 rounded-lg transition-colors group"
                                                            title="Düzenle"
                                                        >
                                                            <Edit2 size={18} className="text-gray-600 group-hover:text-green-600" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(customer)}
                                                            className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                                                            title="Sil"
                                                        >
                                                            <Trash2 size={18} className="text-gray-600 group-hover:text-red-600" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-16 text-center">
                                                <UserCheck size={48} className="mx-auto text-gray-300 mb-3" />
                                                <p className="text-gray-600 font-medium">Müşteri bulunamadı</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination Controls */}
                    {totalCount > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mt-4">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-600">
                                    Toplam <span className="font-semibold">{totalCount}</span> müşteri
                                    <span className="mx-2">•</span>
                                    Sayfa <span className="font-semibold">{currentPage}</span> / {totalPages}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronLeft size={16} />
                                        Önceki
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage >= totalPages}
                                        className="flex items-center gap-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Sonraki
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* View Customer Modal */}
            <ViewCustomerModal
                customer={selectedCustomer}
                isOpen={showViewModal}
                onClose={() => {
                    setShowViewModal(false);
                    setSelectedCustomer(null);
                }}
            />

            {/* Edit Customer Modal */}
            <EditCustomerModal
                customer={selectedCustomer}
                isOpen={showEditModal}
                onClose={() => {
                    setShowEditModal(false);
                    setSelectedCustomer(null);
                }}
                onSuccess={handleEditSuccess}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmDialog
                open={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setCustomerToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Müşteriyi Sil"
                message={`${customerToDelete?.full_name || customerToDelete?.username} isimli müşteriyi tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
                confirmText="Evet, Sil"
                cancelText="İptal"
                variant="danger"
            />
        </div>
    );
}
