import React, { useEffect, useState } from "react";
import { Tag, Plus, Edit2, Trash2, Search, X, Package } from "lucide-react";
import Sidebar from "../components/Sidebar";
import api from "../services/api";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [newCategory, setNewCategory] = useState({
    name: "",
    description: "",
  });

  const token = localStorage.getItem("access");

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get("/categories/");
      setCategories(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch (err: any) {
      setError(err.message || "Kategoriler alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.name) return;
    try {
      await api.post("/categories/", newCategory);
      await fetchCategories();
      setNewCategory({ name: "", description: "" });
      setShowAddModal(false);
      alert("✅ Kategori başarıyla eklendi!");
    } catch (err: any) {
      setError(err.message || "Kategori eklenemedi.");
    }
  };

  const handleUpdateCategory = async () => {
    if (!selectedCategory || !selectedCategory.name) return;
    try {
      await api.put(`/categories/${selectedCategory.id}/`, {
        name: selectedCategory.name,
        description: selectedCategory.description,
      });
      await fetchCategories();
      setShowEditModal(false);
      setSelectedCategory(null);
      alert("✅ Kategori başarıyla güncellendi!");
    } catch (err: any) {
      setError(err.message || "Kategori güncellenemedi.");
    }
  };

  const handleDeleteCategory = async (id: number, name: string) => {
    if (window.confirm(`"${name}" kategorisini silmek istediğinizden emin misiniz?`)) {
      try {
        await api.delete(`/categories/${id}/`);
        await fetchCategories();
        alert("✅ Kategori başarıyla silindi!");
      } catch (err: any) {
        setError(err.message || "Kategori silinemedi.");
      }
    }
  };

  const openEditModal = (category: any) => {
    setSelectedCategory({ ...category });
    setShowEditModal(true);
  };

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-black mx-auto"></div>
          <p className="text-gray-600 mt-4 text-lg">Kategoriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md">
          <p className="text-red-600 font-semibold text-center">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Ana içerik alanı */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Tag size={28} className="text-blue-500" />
              <h1 className="text-2xl font-bold text-gray-900">Kategori Yönetimi</h1>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-black text-white px-6 py-2.5 rounded-full hover:bg-gray-800 transition-all font-medium flex items-center space-x-2"
            >
              <Plus size={20} />
              <span>Yeni Kategori</span>
            </button>
          </div>
        </header>

        {/* Sayfa içeriği */}
        <main className="flex-1 overflow-y-auto">
          {/* Hero Section */}
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
            <div className="max-w-7xl mx-auto px-6 py-12">
              <p className="text-gray-400 text-sm font-medium mb-2">YÖNETİM PANELİ</p>
              <h2 className="text-3xl font-bold mb-2">Kategorileri Yönetin</h2>
              <p className="text-gray-300">Ürün kategorilerini oluşturun, düzenleyin ve silin</p>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-6 py-8">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <Tag size={24} className="text-blue-500" />
                  <span className="text-3xl font-bold text-gray-900">{categories.length}</span>
                </div>
                <p className="text-gray-600 font-medium">Toplam Kategori</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <Package size={24} className="text-green-500" />
                  <span className="text-3xl font-bold text-gray-900">
                    {categories.reduce((sum, cat) => sum + (cat.product_count || 0), 0)}
                  </span>
                </div>
                <p className="text-gray-600 font-medium">Toplam Ürün</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <Search size={24} className="text-purple-500" />
                  <span className="text-3xl font-bold text-gray-900">{filteredCategories.length}</span>
                </div>
                <p className="text-gray-600 font-medium">Filtrelenmiş Sonuç</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
              <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Kategori ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            </div>

            {/* Categories Table */}
            {filteredCategories.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kategori Bilgisi</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Açıklama</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">İstatistik</th>
                      <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredCategories.map((category) => (
                      <tr key={category.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white shadow-sm">
                              <Tag size={20} />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-bold text-gray-900">{category.name}</div>
                              <div className="text-xs text-gray-500">ID: #{category.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600 line-clamp-1 max-w-xs">{category.description || "-"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <Package size={16} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">{category.product_count || 0} Ürün</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-3">
                            <button
                              onClick={() => openEditModal(category)}
                              className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                              title="Düzenle"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(category.id, category.name)}
                              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                              title="Sil"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-20">
                <Tag size={64} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-2xl font-bold text-gray-700 mb-2">Kategori bulunamadı</h3>
                <p className="text-gray-500 mb-6">
                  {searchTerm
                    ? "Arama kriterlerinizi değiştirmeyi deneyin"
                    : "Yeni kategori ekleyerek başlayın"}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-black text-white px-8 py-3 rounded-full hover:bg-gray-800 transition-all font-medium inline-flex items-center space-x-2"
                  >
                    <Plus size={20} />
                    <span>İlk Kategoriyi Ekle</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add/Edit Modals */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center space-x-2">
                <Plus size={24} />
                <span>Yeni Kategori Ekle</span>
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewCategory({ name: "", description: "" });
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Kategori Adı *
                </label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) =>
                    setNewCategory({ ...newCategory, name: e.target.value })
                  }
                  placeholder="Örn: Beyaz Eşya"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Açıklama
                </label>
                <textarea
                  value={newCategory.description}
                  onChange={(e) =>
                    setNewCategory({ ...newCategory, description: e.target.value })
                  }
                  placeholder="Kategori açıklaması..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black resize-none"
                />
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between rounded-b-2xl">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewCategory({ name: "", description: "" });
                }}
                className="px-6 py-3 border border-gray-300 rounded-full hover:bg-gray-100 transition-all font-medium text-gray-700"
              >
                İptal
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!newCategory.name}
                className="bg-black text-white px-8 py-3 rounded-full hover:bg-gray-800 transition-all font-semibold flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={20} />
                <span>Kategori Ekle</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showEditModal && selectedCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center space-x-2">
                <Edit2 size={24} />
                <span>Kategoriyi Düzenle</span>
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedCategory(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Kategori Adı *
                </label>
                <input
                  type="text"
                  value={selectedCategory.name}
                  onChange={(e) =>
                    setSelectedCategory({ ...selectedCategory, name: e.target.value })
                  }
                  placeholder="Örn: Beyaz Eşya"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Açıklama
                </label>
                <textarea
                  value={selectedCategory.description || ""}
                  onChange={(e) =>
                    setSelectedCategory({
                      ...selectedCategory,
                      description: e.target.value,
                    })
                  }
                  placeholder="Kategori açıklaması..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black resize-none"
                />
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between rounded-b-2xl">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedCategory(null);
                }}
                className="px-6 py-3 border border-gray-300 rounded-full hover:bg-gray-100 transition-all font-medium text-gray-700"
              >
                İptal
              </button>
              <button
                onClick={handleUpdateCategory}
                disabled={!selectedCategory.name}
                className="bg-black text-white px-8 py-3 rounded-full hover:bg-gray-800 transition-all font-semibold flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Edit2 size={20} />
                <span>Güncelle</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}