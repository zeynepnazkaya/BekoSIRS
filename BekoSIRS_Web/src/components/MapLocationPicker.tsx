// MapLocationPicker - Leaflet-based location picker for KKTC
// Wrapped with error handling to prevent crashes
import { useEffect, useState, Suspense, Component } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon issue
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

interface MapLocationPickerProps {
    initialLat?: number | null;
    initialLng?: number | null;
    onLocationSelect: (lat: number, lng: number) => void;
    focusPoint?: { lat: number; lng: number; zoom?: number } | null;
    // Deprecated: use focusPoint instead
    districtCenter?: { lat: number; lng: number } | null;
}

// KKTC District centers (approximate)
const DISTRICT_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
    'Lefkoşa': { lat: 35.1856, lng: 33.3823, zoom: 13 },
    'Gazimağusa': { lat: 35.1257, lng: 33.9407, zoom: 13 },
    'Girne': { lat: 35.3382, lng: 33.3192, zoom: 13 },
    'Güzelyurt': { lat: 35.2001, lng: 32.9924, zoom: 13 },
    'İskele': { lat: 35.2882, lng: 33.8835, zoom: 13 },
    'Lefke': { lat: 35.1097, lng: 32.8494, zoom: 13 },
};

// Default center: KKTC (Northern Cyprus)
const KKTC_CENTER = { lat: 35.2, lng: 33.5, zoom: 10 };

// Error Boundary component
interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

class MapErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Map Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-[300px] flex items-center justify-center bg-gray-100 rounded-xl border border-gray-300">
                    <div className="text-center text-gray-500">
                        <div className="text-3xl mb-2">🗺️</div>
                        <p className="text-sm">Harita yüklenemedi</p>
                        <button
                            onClick={() => this.setState({ hasError: false })}
                            className="mt-2 text-xs text-blue-600 hover:underline"
                        >
                            Tekrar Dene
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Component to handle map clicks
function LocationMarker({ position, onLocationSelect }: {
    position: [number, number] | null;
    onLocationSelect: (lat: number, lng: number) => void;
}) {
    useMapEvents({
        click(e) {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
        },
    });

    return position ? <Marker position={position} /> : null;
}

// Component to update map view when district changes
function MapViewUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        if (map && center && center[0] && center[1]) {
            map.setView(center, zoom);
        }
    }, [center, zoom, map]);
    return null;
}

// Loading placeholder
function MapLoader() {
    return (
        <div className="h-[300px] flex items-center justify-center bg-gray-100 rounded-xl border border-gray-300">
            <div className="text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-sm">Harita yükleniyor...</p>
            </div>
        </div>
    );
}

// Inner map component
function MapInner({
    initialLat,
    initialLng,
    onLocationSelect,
    districtCenter,
    focusPoint,
}: MapLocationPickerProps) {
    const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
    const [mapCenter, setMapCenter] = useState<[number, number]>([KKTC_CENTER.lat, KKTC_CENTER.lng]);
    const [mapZoom, setMapZoom] = useState(KKTC_CENTER.zoom);
    const [isReady, setIsReady] = useState(false);

    // Initialize marker position on mount
    useEffect(() => {
        if (typeof initialLat === 'number' && typeof initialLng === 'number' && !isNaN(initialLat) && !isNaN(initialLng)) {
            setMarkerPosition([initialLat, initialLng]);
            setMapCenter([initialLat, initialLng]);
            setMapZoom(15);
        }
        setIsReady(true);
    }, []);

    // Update marker when initial values change (after mount)
    useEffect(() => {
        if (!isReady) return;
        if (typeof initialLat === 'number' && typeof initialLng === 'number' && !isNaN(initialLat) && !isNaN(initialLng)) {
            setMarkerPosition([initialLat, initialLng]);
            setMapCenter([initialLat, initialLng]);
            setMapZoom(15);
        }
    }, [initialLat, initialLng, isReady]);

    // Update map center when district or focus point changes
    useEffect(() => {
        if (focusPoint && focusPoint.lat && focusPoint.lng) {
            setMapCenter([focusPoint.lat, focusPoint.lng]);
            setMapZoom(focusPoint.zoom || 15);
        } else if (districtCenter && districtCenter.lat && districtCenter.lng) {
            setMapCenter([districtCenter.lat, districtCenter.lng]);
            setMapZoom(14);
        }
    }, [districtCenter, focusPoint]);

    const handleLocationSelect = (lat: number, lng: number) => {
        setMarkerPosition([lat, lng]);
        onLocationSelect(lat, lng);
    };

    if (!isReady) {
        return <MapLoader />;
    }

    return (
        <div className="rounded-xl overflow-hidden border border-gray-300 shadow-sm">
            <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                style={{ height: '300px', width: '100%' }}
                scrollWheelZoom={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapViewUpdater center={mapCenter} zoom={mapZoom} />
                <LocationMarker
                    position={markerPosition}
                    onLocationSelect={handleLocationSelect}
                />
            </MapContainer>
            {markerPosition && (
                <div className="bg-gray-50 px-3 py-2 text-xs text-gray-600 flex justify-between">
                    <span>📍 Seçili Konum</span>
                    <span className="font-mono">
                        {markerPosition[0].toFixed(6)}, {markerPosition[1].toFixed(6)}
                    </span>
                </div>
            )}
        </div>
    );
}

// Main component with error boundary
export default function MapLocationPicker(props: MapLocationPickerProps) {
    return (
        <MapErrorBoundary>
            <Suspense fallback={<MapLoader />}>
                <MapInner {...props} />
            </Suspense>
        </MapErrorBoundary>
    );
}

// Export district centers for use in parent components
export { DISTRICT_CENTERS };
