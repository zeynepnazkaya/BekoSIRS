// Customer Service - Customer Management API
import api from './api';
import type { Customer, CustomerDetail, CustomerFormData, CustomerFilters, PaginatedResponse } from '../types/customer';

export const customerService = {
    /**
     * Get list of customers with optional filters and pagination
     */
    getCustomers: async (filters?: CustomerFilters): Promise<PaginatedResponse<Customer>> => {
        const params: any = {};

        if (filters?.search) {
            params.search = filters.search;
        }

        if (filters?.ordering) {
            params.ordering = filters.ordering;
        }

        if (filters?.page) {
            params.page = filters.page;
        }

        const response = await api.get('/customers/', { params });
        // Handle pagination response (DRF returns { count, next, previous, results: [] })
        if (response.data && response.data.results) {
            return {
                count: response.data.count,
                next: response.data.next,
                previous: response.data.previous,
                results: response.data.results
            };
        }
        // Fallback for non-paginated response (if any)
        return {
            count: Array.isArray(response.data) ? response.data.length : 0,
            next: null,
            previous: null,
            results: Array.isArray(response.data) ? response.data : []
        };
    },

    /**
     * Get detailed information for a single customer
     */
    getCustomer: async (id: number): Promise<CustomerDetail> => {
        const response = await api.get(`/customers/${id}/`);
        return response.data;
    },

    /**
     * Update customer information
     */
    updateCustomer: async (
        id: number,
        data: Partial<CustomerFormData>
    ): Promise<CustomerDetail> => {
        const response = await api.patch(`/customers/${id}/`, data);
        return response.data;
    },

    /**
     * Delete a customer completely
     */
    deleteCustomer: async (id: number): Promise<void> => {
        await api.delete(`/customers/${id}/`);
    },
};
