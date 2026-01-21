import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import {
  Wrench,
  Search,
  Filter,
  Clock,
  CheckCircle,
  Play,
  X,
  User,
  Phone,
  MapPin,
  FileText,
  ChevronDown,
  Archive,
} from "lucide-react";
import api from "../services/api";

interface ServiceRequest {
  id: number;
  customer: number;
  customer_name: string;
  product_name: string;
  request_type: string;
  status: string;
  description: string;
  created_at: string;
  updated_at: string;
  resolution_notes: string | null;
  // Customer details (from API)
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  product_ownership_detail?: {
    product?: {
      name?: string;
    };
  };
}

// Simplified 3-status system
const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  pending: { label: "Bekleniyor", color: "text-orange-600", bgColor: "bg-orange-100", icon: Clock },
  in_queue: { label: "Bekleniyor", color: "text-orange-600", bgColor: "bg-orange-100", icon: Clock },
  in_progress: { label: "Çözülüyor", color: "text-blue-600", bgColor: "bg-blue-100", icon: Play },
  completed: { label: "Çözüldü", color: "text-green-600", bgColor: "bg-green-100", icon: CheckCircle },
  cancelled: { label: "İptal", color: "text-gray-600", bgColor: "bg-gray-100", icon: X },
};

// Status options for dropdown (only 3 main statuses)
const statusOptions = [
  { value: "pending", label: "Bekleniyor" },
  { value: "in_progress", label: "Çözülüyor" },
  { value: "completed", label: "Çözüldü" },
];

const requestTypeLabels: Record<string, string> = {
  repair: "Tamir",
  maintenance: "Bakım",
  warranty: "Garanti",
  complaint: "Şikayet",
  other: "Diğer",
};

// Tabs configuration
const tabs = [
  { id: 'all', label: 'Tümü (Aktif)' },
  { id: 'repair', label: 'Tamir' },
  { id: 'maintenance', label: 'Bakım' },
  { id: 'warranty', label: 'Garanti' },
  { id: 'complaint', label: 'Şikayet' },
  { id: 'history', label: 'Geçmiş / Tamamlanan' },
];

export default function ServiceRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tümü");
  const [activeTab, setActiveTab] = useState("all");

  // Detail panel state
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get("/service-requests/");
      const requestsArray = Array.isArray(response.data) ? response.data : response.data.results || [];
      setRequests(requestsArray);
    } catch (err: any) {
      setError(err.message || "Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // Open detail panel
  const openDetailPanel = (req: ServiceRequest) => {
    setSelectedRequest(req);
    setResolutionNotes(req.resolution_notes || "");
    setShowDetailPanel(true);
  };

  // Change status
  const handleStatusChange = async (newStatus: string) => {
    if (!selectedRequest) return;

    setActionLoading(true);
    try {
      if (newStatus === "in_progress") {
        await api.post(`/service-requests/${selectedRequest.id}/start/`);
      } else if (newStatus === "completed") {
        await api.post(`/service-requests/${selectedRequest.id}/complete/`, {
          resolution_notes: resolutionNotes
        });
      } else if (newStatus === "pending") {
        // Reset to pending (use PATCH if available)
        await api.patch(`/service-requests/${selectedRequest.id}/`, { status: "pending" });
      }

      await fetchData(); // Refresh data to update lists/tabs

      // Update selected request copy locally
      const updated = { ...selectedRequest, status: newStatus };
      setSelectedRequest(updated);

      // If moved to completed/cancelled and we are in active tab, maybe close panel or warn?
      // For now just keeping it open.
    } catch (err: any) {
      alert(err.response?.data?.error || "İşlem başarısız");
    } finally {
      setActionLoading(false);
    }
  };

  // Save notes without changing status
  const handleSaveNotes = async () => {
    if (!selectedRequest) return;

    setActionLoading(true);
    try {
      await api.patch(`/service-requests/${selectedRequest.id}/`, {
        resolution_notes: resolutionNotes
      });
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Notlar kaydedilemedi");
    } finally {
      setActionLoading(false);
    }
  };

  // Check if a request is "Active" (Pending/In Progress)
  const isActiveRequest = (status: string) => {
    return ['pending', 'in_queue', 'in_progress'].includes(status);
  };

  const filteredRequests = requests.filter((req) => {
    // 1. Text Search
    const matchesSearch =
      req.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.description?.toLowerCase().includes(searchTerm.toLowerCase());

    // 2. Status Filter (Dropdown)
    let matchesStatus = statusFilter === "Tümü";
    if (statusFilter === "pending") matchesStatus = req.status === "pending" || req.status === "in_queue";
    else if (statusFilter === "in_progress") matchesStatus = req.status === "in_progress";
    else if (statusFilter === "completed") matchesStatus = req.status === "completed";

    // 3. Tab Filter (Active vs History logic)
    let matchesTab = false;

    if (activeTab === 'history') {
      // Show ONLY Completed or Cancelled
      matchesTab = ['completed', 'cancelled'].includes(req.status);
    } else {
      // Active Tabs: Show ONLY Active requests
      if (!isActiveRequest(req.status)) return false;

      if (activeTab === 'all') {
        matchesTab = true;
      } else {
        // Filter by type for active tabs
        matchesTab = (req.request_type || 'other') === activeTab;
      }
    }

    return matchesSearch && matchesStatus && matchesTab;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Get display status (map in_queue to pending for UI)
  const getDisplayStatus = (status: string) => {
    if (status === "in_queue") return "pending";
    return status;
  };

  // Calculate counts for tabs
  const getTabCount = (tabId: string) => {
    if (tabId === 'history') {
      return requests.filter(r => ['completed', 'cancelled'].includes(r.status)).length;
    }

    // For all other tabs, we strictly count ACTIVE items
    const activeRequests = requests.filter(r => isActiveRequest(r.status));

    if (tabId === 'all') return activeRequests.length;
    return activeRequests.filter(r => (r.request_type || 'other') === tabId).length;
  };

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center space-x-3">
              <Wrench size={28} className="text-purple-500" />
              <h1 className="text-2xl font-bold text-gray-900">Servis Talepleri</h1>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-black text-white">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <h2 className="text-2xl font-bold mb-1">Servis Yönetimi</h2>
            <p className="text-purple-200 text-sm">Talepleri hızlıca işleme alın</p>

            {/* Stats - 3 status */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              {[
                { key: "pending", statuses: ["pending", "in_queue"] },
                { key: "in_progress", statuses: ["in_progress"] },
                { key: "completed", statuses: ["completed"] },
              ].map(({ key, statuses }) => {
                const config = statusConfig[key];
                const count = requests.filter((r) => statuses.includes(r.status)).length;
                return (
                  <div key={key} className="bg-white/10 backdrop-blur rounded-xl p-4">
                    <p className="text-purple-200 text-xs">{config.label}</p>
                    <p className="text-3xl font-bold mt-1">{count}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto w-full px-6 py-6">
          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Talep ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Filter size={18} className="text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer bg-white text-sm"
              >
                <option value="Tümü">Tümü</option>
                <option value="pending">Bekleniyor</option>
                <option value="in_progress">Çözülüyor</option>
                <option value="completed">Çözüldü</option>
              </select>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6 overflow-x-auto pb-2">
            <div className="flex space-x-2">
              {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                const count = getTabCount(tab.id);
                const isHistory = tab.id === 'history';

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                                flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap
                                ${isActive
                        ? (isHistory ? 'bg-gray-800 text-white shadow-md' : 'bg-purple-600 text-white shadow-md')
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}
                            `}
                  >
                    {isHistory && <Archive size={14} className={isActive ? 'text-white' : 'text-gray-500'} />}
                    <span>{tab.label}</span>
                    <span className={`
                                px-1.5 py-0.5 rounded-full text-xs
                                ${isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-200 text-gray-700'}
                            `}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Requests Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl">{error}</div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Müşteri</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ürün</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tür</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Durum</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tarih</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRequests.map((req) => {
                    const displayStatus = getDisplayStatus(req.status);
                    const status = statusConfig[displayStatus] || statusConfig.pending;
                    const StatusIcon = status.icon;
                    return (
                      <tr
                        key={req.id}
                        className="hover:bg-purple-50 cursor-pointer transition-colors"
                        onClick={() => openDetailPanel(req)}
                      >
                        <td className="px-6 py-4">
                          <span className="font-bold text-purple-600">SR-{req.id}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                              <User size={14} className="text-purple-600" />
                            </div>
                            <span className="font-medium text-gray-900">{req.customer_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={req.product_name}>
                          {req.product_name}
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-gray-100 px-2.5 py-1 rounded text-xs font-medium text-gray-700">
                            {requestTypeLabels[req.request_type] || req.request_type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`${status.bgColor} ${status.color} px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 w-fit`}>
                            <StatusIcon size={12} />
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {formatDate(req.created_at)}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-400">
                          <div className="flex justify-end hover:text-purple-600 transition-colors">
                            <Play size={16} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredRequests.length === 0 && (
                <div className="text-center py-16">
                  {activeTab === 'history' ? (
                    <>
                      <CheckCircle size={48} className="mx-auto text-gray-200 mb-4" />
                      <p className="text-gray-500">Henüz tamamlanmış veya taranmış bir talep yok</p>
                    </>
                  ) : (
                    <>
                      <Wrench size={48} className="mx-auto text-gray-200 mb-4" />
                      <p className="text-gray-500">Süper! Bu kategoride bekleyen iş yok</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Detail Side Panel */}
      {showDetailPanel && selectedRequest && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowDetailPanel(false)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center bg-purple-600 text-white">
              <h2 className="text-lg font-bold">SR-{selectedRequest.id}</h2>
              <button
                onClick={() => setShowDetailPanel(false)}
                className="p-2 hover:bg-purple-700 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Customer Info */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                  <User size={14} /> Müşteri Bilgileri
                </h3>
                <div className="space-y-2">
                  <p className="font-semibold text-lg">{selectedRequest.customer_name}</p>
                  {selectedRequest.customer_phone && (
                    <a
                      href={`tel:${selectedRequest.customer_phone}`}
                      className="flex items-center gap-2 text-purple-600 hover:underline"
                    >
                      <Phone size={14} />
                      {selectedRequest.customer_phone}
                    </a>
                  )}
                  {selectedRequest.customer_email && (
                    <p className="text-sm text-gray-600">{selectedRequest.customer_email}</p>
                  )}
                  {selectedRequest.customer_address && (
                    <p className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin size={14} />
                      {selectedRequest.customer_address}
                    </p>
                  )}
                </div>
              </div>

              {/* Product & Type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 uppercase">Ürün</p>
                  <p className="font-semibold text-sm mt-1">{selectedRequest.product_name}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 uppercase">Tür</p>
                  <p className="font-semibold text-sm mt-1">
                    {requestTypeLabels[selectedRequest.request_type] || selectedRequest.request_type}
                  </p>
                </div>
              </div>

              {/* Complaint/Description */}
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                <h3 className="text-xs font-bold text-orange-600 uppercase mb-2 flex items-center gap-2">
                  <FileText size={14} /> Şikayet / Açıklama
                </h3>
                <p className="text-gray-800">{selectedRequest.description || "Açıklama yok"}</p>
              </div>

              {/* Status Selector */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Durum Değiştir</h3>
                <div className="relative">
                  <select
                    value={getDisplayStatus(selectedRequest.status)}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={actionLoading || selectedRequest.status === "cancelled"}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white font-medium disabled:opacity-50"
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                </div>
              </div>

              {/* Resolution Notes */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Çözüm Notları</h3>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Yapılan işlemleri yazın..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  rows={4}
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={actionLoading}
                  className="mt-2 w-full bg-gray-100 text-gray-700 py-2 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  Notları Kaydet
                </button>
              </div>

              {/* Existing Resolution Notes (if completed) */}
              {selectedRequest.status === "completed" && selectedRequest.resolution_notes && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                  <h3 className="text-xs font-bold text-green-600 uppercase mb-2">Çözüm</h3>
                  <p className="text-gray-800">{selectedRequest.resolution_notes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50">
              <p className="text-xs text-gray-400 text-center">
                Oluşturulma: {formatDate(selectedRequest.created_at)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
