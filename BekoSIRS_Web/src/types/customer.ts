// TypeScript interfaces for Customer Management and KKTC Address System

export interface District {
    id: number;
    name: string;
    center_lat?: number;
    center_lng?: number;
}

export interface Area {
    id: number;
    name: string;
    district: number;
    district_name?: string;
}

export interface Customer {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    phone_number: string | null;
    district: number | null;
    district_name?: string;
    area: number | null;
    area_name?: string;
    open_address?: string;
    role?: string;
    is_active?: boolean;
}

export interface CustomerDetail extends Customer {
    address?: string;
    address_city?: string;
    address_lat?: number | null;
    address_lng?: number | null;
    notify_service_updates?: boolean;
    notify_price_drops?: boolean;
    notify_restock?: boolean;
    notify_recommendations?: boolean;
    notify_warranty_expiry?: boolean;
    notify_general?: boolean;
    biometric_enabled?: boolean;
    date_joined?: string;
    last_login?: string | null;
}

export interface CustomerFormData {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    district: number | null;
    area: number | null;
    open_address: string;
    address_lat?: number | null;
    address_lng?: number | null;
}

export interface CustomerFilters {
    search?: string;
    ordering?: 'first_name' | '-first_name' | 'last_name' | '-last_name';
    page?: number;
}

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}
