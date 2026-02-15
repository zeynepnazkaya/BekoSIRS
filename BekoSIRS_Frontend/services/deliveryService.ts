import api from './api';

export interface Delivery {
    id: number;
    assignment: number;
    customer_name: string;
    product_name: string;
    scheduled_date: string;
    status: 'WAITING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
    status_display: string;
    delivery_order: number;
    address: string;
    address_lat: string;
    address_lng: string;
    customer_phone_snapshot: string;
}

export const getMyRoute = async () => {
    const response = await api.get<Delivery[]>('/api/v1/delivery-person/my_route/');
    return response.data;
};

export const updateDeliveryStatus = async (id: number, status: string) => {
    const response = await api.post(`/api/v1/delivery-person/${id}/update_status/`, { status });
    return response.data;
};
