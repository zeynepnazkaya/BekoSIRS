import { useState, useEffect } from "react";
import { X, Save, MapPin } from "lucide-react";
import { customerService } from "../services/customerService";
import { locationService } from "../services/locationService";
import MapLocationPicker, { DISTRICT_CENTERS } from "./MapLocationPicker";
import type { CustomerFormData, District, Area, CustomerDetail } from "../types/customer";

interface EditCustomerModalProps {
    customer: CustomerDetail | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function EditCustomerModal({
    customer,
    isOpen,
    onClose,
    onSuccess,
}: EditCustomerModalProps) {
    const [formData, setFormData] = useState<CustomerFormData>({
        first_name: "",
        last_name: "",
        email: "",
        phone_number: "",
        district: null,
        area: null,
        open_address: "",
        address_lat: null,
        address_lng: null,
    });

    const [districts, setDistricts] = useState<District[]>([]);
    const [areas, setAreas] = useState<Area[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadDistricts();
        }
    }, [isOpen]);

    useEffect(() => {
        if (customer && isOpen) {
            setFormData({
                first_name: customer.first_name || "",
                last_name: customer.last_name || "",
                email: customer.email || "",
                phone_number: customer.phone_number || "",
                district: customer.district,
                area: customer.area,
                open_address: customer.open_address || "",
                address_lat: customer.address_lat || null,
                address_lng: customer.address_lng || null,
            });

            if (customer.district) {
                loadAreas(customer.district);
            }
        }
    }, [customer, isOpen]);

    const loadDistricts = async () => {
        try {
            const data = await locationService.getDistricts();
            setDistricts(data);
        } catch (err) {
            console.error("Error loading districts:", err);
        }
    };

    const loadAreas = async (districtId: number) => {
        try {
            const data = await locationService.getAreas(districtId);
            setAreas(data);
        } catch (err) {
            console.error("Error loading areas:", err);
        }
    };

    const handleDistrictChange = (districtId: string) => {
        const id = districtId ? parseInt(districtId) : null;
        setFormData((prev) => ({
            ...prev,
            district: id,
            area: null, // Reset area when district changes
        }));

        if (id) {
            loadAreas(id);
        } else {
            setAreas([]);
        }

        // Set focus to district center
        const selectedDistrict = districts.find(d => d.id === parseInt(districtId));
        if (selectedDistrict) {
            const center = DISTRICT_CENTERS[selectedDistrict.name];
            if (center) {
                setMapFocus({ lat: center.lat, lng: center.lng, zoom: center.zoom });
            }
        }
    };

    const handleAreaChange = async (areaId: string) => {
        const id = areaId ? parseInt(areaId) : null;
        setFormData(prev => ({
            ...prev,
            area: id
        }));

        if (!id) return;

        // Find district and area names for geocoding
        const selectedDistrict = districts.find(d => d.id === formData.district);
        const selectedArea = areas.find(a => a.id === id);

        if (selectedDistrict && selectedArea) {
            try {
                // Fetch coordinates from Nominatim (OpenStreetMap)
                const query = `${selectedArea.name}, ${selectedDistrict.name}, Cyprus`;
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
                    headers: {
                        'User-Agent': 'BekoSIRS-App/1.0'
                    }
                });

                const data = await response.json();
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lng = parseFloat(data[0].lon);
                    setMapFocus({ lat, lng, zoom: 15 });
                }
            } catch (err) {
                console.warn("Geocoding failed:", err);
            }
        }
    };

    // Initialize focus point from previous selection if any
    useEffect(() => {
        if (!isOpen) {
            setMapFocus(null);
        } else {
            // If we have saved coordinates, focus there
            if (customer && customer.address_lat && customer.address_lng) {
                setMapFocus({ lat: Number(customer.address_lat), lng: Number(customer.address_lng), zoom: 15 });
            } else if (districts.length > 0 && formData.district) {
                // Or focus on district center if available
                const selectedDistrict = districts.find(d => d.id === formData.district);
                if (selectedDistrict) {
                    const center = DISTRICT_CENTERS[selectedDistrict.name];
                    if (center) {
                        setMapFocus({ lat: center.lat, lng: center.lng, zoom: center.zoom });
                    }
                }
            }
        }
    }, [isOpen, customer, districts, formData.district]);

    const handleLocationSelect = async (lat: number, lng: number) => {
        // Limit precision to 6 decimal places to avoid backend validation errors (max_digits=10)
        const latFixed = parseFloat(lat.toFixed(6));
        const lngFixed = parseFloat(lng.toFixed(6));

        setFormData(prev => ({
            ...prev,
            address_lat: latFixed,
            address_lng: lngFixed,
        }));

        // Reverse geocoding to get open_address
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
                headers: {
                    'User-Agent': 'BekoSIRS-App/1.0',
                    'Accept-Language': 'tr-TR,tr;q=0.9'
                }
            });
            const data = await response.json();

            if (data && data.display_name) {
                // Sadece spesifik kismi alabilmek icin address objesine bakabiliriz
                // Ama genelde display_name yeterli olur
                setFormData(prev => ({
                    ...prev,
                    open_address: data.display_name
                }));
            }
        } catch (err) {
            console.warn("Reverse geocoding failed:", err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Validation
        if (!formData.first_name.trim()) {
            setError("Ad alanı zorunludur");
            return;
        }
        if (!formData.last_name.trim()) {
            setError("Soyad alanı zorunludur");
            return;
        }
        if (!formData.email.trim()) {
            setError("E-posta alanı zorunludur");
            return;
        }

        try {
            setLoading(true);

            // Sanitize coordinates to ensure they don't exceed backend limits (max_digits=10)
            const dataToSend = { ...formData };

            if (dataToSend.address_lat !== null && typeof dataToSend.address_lat === 'number') {
                dataToSend.address_lat = Number(dataToSend.address_lat.toFixed(6));
            }
            if (dataToSend.address_lng !== null && typeof dataToSend.address_lng === 'number') {
                dataToSend.address_lng = Number(dataToSend.address_lng.toFixed(6));
            }

            await customerService.updateCustomer(customer!.id, dataToSend);
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                onSuccess();
                onClose();
            }, 1500);
        } catch (err: any) {
            console.error("Update error:", err);
            let errorMessage = "Güncelleme başarısız oldu";

            if (err.response?.data) {
                const data = err.response.data;
                if (typeof data === 'string') {
                    errorMessage = data;
                } else if (data.message) {
                    errorMessage = data.message;
                } else {
                    // DRF returns field errors as object: { field: ["error"] }
                    // Parse and format them for display
                    const messages = Object.entries(data).map(([key, value]) => {
                        // Map technical field names to Turkish labels
                        const fieldLabels: Record<string, string> = {
                            first_name: 'Ad',
                            last_name: 'Soyad',
                            email: 'E-posta',
                            phone_number: 'Telefon',
                            district: 'İlçe',
                            area: 'Mahalle',
                            open_address: 'Açık Adres',
                            address_lat: 'Konum (Enlem)',
                            address_lng: 'Konum (Boylam)',
                            non_field_errors: 'Hata'
                        };

                        const label = fieldLabels[key] || key;
                        const msg = Array.isArray(value) ? value.join(", ") : String(value);
                        return `${label}: ${msg}`;
                    });

                    if (messages.length > 0) {
                        errorMessage = messages.join("\n");
                    }
                }
            }

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !customer) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
                    <h2 className="text-2xl font-bold text-gray-900">Müşteriyi Düzenle</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Success Message */}
                    {success && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
                            <span className="text-xl">✓</span>
                            <span>Müşteri bilgileri başarıyla kaydedildi!</span>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg whitespace-pre-wrap">
                            {error}
                        </div>
                    )}

                    {/* Personal Information */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Kişisel Bilgiler</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Ad <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.first_name}
                                    onChange={(e) =>
                                        setFormData({ ...formData, first_name: e.target.value })
                                    }
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                                    placeholder="Ad"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Soyad <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.last_name}
                                    onChange={(e) =>
                                        setFormData({ ...formData, last_name: e.target.value })
                                    }
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                                    placeholder="Soyad"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    E-posta <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                                    placeholder="ornek@email.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Telefon
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone_number}
                                    onChange={(e) =>
                                        setFormData({ ...formData, phone_number: e.target.value })
                                    }
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                                    placeholder="+90 555 123 45 67"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Address Information */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Adres Bilgileri</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    İlçe
                                </label>
                                <select
                                    value={formData.district || ""}
                                    onChange={(e) => handleDistrictChange(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black cursor-pointer"
                                >
                                    <option value="">İlçe Seçiniz</option>
                                    {districts.map((district) => (
                                        <option key={district.id} value={district.id}>
                                            {district.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Mahalle/Köy
                                </label>
                                <select
                                    value={formData.area || ""}
                                    onChange={(e) => handleAreaChange(e.target.value)}
                                    disabled={!formData.district || areas.length === 0}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed"
                                >
                                    <option value="">
                                        {formData.district
                                            ? areas.length === 0
                                                ? "Yükleniyor..."
                                                : "Mahalle/Köy Seçiniz"
                                            : "Önce İlçe Seçiniz"}
                                    </option>
                                    {areas.map((area) => (
                                        <option key={area.id} value={area.id}>
                                            {area.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Açık Adres
                            </label>
                            <textarea
                                value={formData.open_address}
                                onChange={(e) =>
                                    setFormData({ ...formData, open_address: e.target.value })
                                }
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black resize-none"
                                rows={3}
                                placeholder="Ev/Apartman numarası, cadde, sokak vb."
                            />
                        </div>

                        {/* Map Location Picker */}
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                <MapPin size={16} />
                                Konum Seçimi
                            </label>
                            <p className="text-xs text-gray-500 mb-3">
                                Harita üzerinde tıklayarak müşterinin konumunu seçin. İlçe seçtiğinizde harita otomatik olarak o bölgeye odaklanır.
                            </p>
                            <MapLocationPicker
                                initialLat={formData.address_lat}
                                initialLng={formData.address_lng}
                                onLocationSelect={handleLocationSelect}
                                focusPoint={mapFocus}
                            />
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between rounded-b-2xl">
                    <button
                        onClick={onClose}
                        type="button"
                        className="px-6 py-3 border border-gray-300 rounded-full hover:bg-gray-100 font-medium transition-colors"
                    >
                        İptal
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="bg-black text-white px-8 py-3 rounded-full hover:bg-gray-800 font-semibold flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Save size={20} />
                        <span>{loading ? "Kaydediliyor..." : "Kaydet"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
