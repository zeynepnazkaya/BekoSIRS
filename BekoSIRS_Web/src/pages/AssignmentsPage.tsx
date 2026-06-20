import React, { useEffect, useState, useMemo } from "react";
import * as Lucide from "lucide-react";
import Sidebar from "../components/Sidebar";
import { ToastContainer, type ToastType } from "../components/Toast";
import api from "../services/api";
import { assignmentAPI, categoryAPI, customerAPI, deliveryAPI, deliveryRouteAPI, productAPI } from "../services/api";
import { useTranslation } from "react-i18next";

const {
    Package = () => <span>📦</span>,
    Plus = () => <span>+</span>,
    Search = () => <span>🔍</span>,
    Calendar = () => <span>📅</span>,
    X = () => <span>✕</span>,
    Trash2 = () => <span>🗑</span>,
    Loader2 = () => <span>↻</span>,
    AlertCircle = () => <span>⚠</span>,
    CheckCircle = () => <span>✓</span>,
    Truck = () => <span>🚚</span>,
    MapPin = () => <span>📍</span>,
    Route = () => <span>🗺️</span>,
    UserCheck = () => <span>👤</span>,
    Navigation = () => <span>🧭</span>,
} = Lucide as any;

/* ============ Interfaces ============ */
interface Customer {
    id: number; username: string; email: string;
    first_name: string; last_name: string;
    full_name?: string; formatted_address?: string; phone_number?: string;
    address_lat?: number | string | null;
    address_lng?: number | string | null;
}
interface Product {
    id: number; name: string; brand: string;
    model_code?: string; stock?: number; category?: { id?: number; name: string };
    category_name?: string;
}
interface CategoryOption { id: number; name: string; product_count?: number; }
interface ProductAssignment {
    id: number; customer: Customer; product: Product;
    assigned_at: string; status: string; status_display: string;
    quantity: number; notes?: string;
    delivery_info?: {
        id: number; status: string; status_display: string;
        scheduled_date: string; time_window_start?: string; time_window_end?: string;
    };
}
interface DeliveryItem {
    id: number; assignment: number;
    customer_name: string; customer_phone: string; customer_address: string;
    product_name: string; product_model_code: string; quantity: number;
    scheduled_date: string; status: string; status_display: string;
    delivery_order: number; address_lat: number; address_lng: number; driver_name?: string;
}
interface RouteResult {
    route_id: number; date: string;
    total_distance_km: number; total_duration_min: number; stop_count: number;
    stops: Array<{
        stop_order: number; delivery_id: number; customer_name: string;
        product_name: string; address: string; lat: number; lng: number;
        distance_from_previous_km: number; duration_from_previous_min: number;
    }>;
    warnings?: { no_coordinates?: number[] };
}
interface DriverUser { id: number; username: string; first_name: string; last_name: string; }
interface DepotOption { id: number; name: string; is_default?: boolean; }
interface PreparedRouteStop {
    id: number;
    stop_order: number;
    distance_from_previous_km?: number;
    duration_from_previous_min?: number;
    delivery: DeliveryItem;
}
interface PreparedRoute {
    id: number;
    date: string;
    total_distance_km?: number;
    total_duration_min?: number;
    assigned_driver?: number | null;
    driver_name?: string | null;
    status: string;
    stop_count: number;
    stops: PreparedRouteStop[];
}

/* ============ Component ============ */
export default function AssignmentsPage() {
    const { t, i18n } = useTranslation();

    /* --- Main Tab --- */
    const [mainTab, setMainTab] = useState<'unscheduled' | 'planning'>('unscheduled');

    /* --- Shared State --- */
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ planned: 0, scheduled: 0, out_for_delivery: 0, delivered: 0 });
    const [toasts, setToasts] = useState<Array<{ id: string; type: ToastType; message: string }>>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [drivers, setDrivers] = useState<DriverUser[]>([]);
    const [depots, setDepots] = useState<DepotOption[]>([]);
    const [preparedRoutes, setPreparedRoutes] = useState<PreparedRoute[]>([]);
    const [expandedPreparedRoute, setExpandedPreparedRoute] = useState<number | null>(null);

    /* --- Tab 1: Unscheduled --- */
    const [assignments, setAssignments] = useState<ProductAssignment[]>([]);
    const [selectedUnscheduled, setSelectedUnscheduled] = useState<number[]>([]);
    const [searchUnscheduled, setSearchUnscheduled] = useState("");

    /* --- Tab 2: Planning --- */
    const [planningDate, setPlanningDate] = useState(new Date().toISOString().split("T")[0]);
    const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
    const [selectedDeliveries, setSelectedDeliveries] = useState<number[]>([]);
    const [searchPlanning, setSearchPlanning] = useState("");
    const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
    const [optimizing, setOptimizing] = useState(false);

    /* --- Auto-Plan State --- */
    const [autoPlanModal, setAutoPlanModal] = useState(false);
    const [autoPlanLoading, setAutoPlanLoading] = useState(false);
    const [autoPlanData, setAutoPlanData] = useState<any>(null);
    const [autoPlanApproving, setAutoPlanApproving] = useState(false);
    const [expandedDay, setExpandedDay] = useState<number | null>(null);
    const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([2, 3, 6]);
    const [maxHoursPerDay, setMaxHoursPerDay] = useState(8);
    const [selectedDepotId, setSelectedDepotId] = useState<number | "">("");
    const [calendarRebalancing, setCalendarRebalancing] = useState(false);

    /* --- Drag & Drop --- */
    const [draggingRoute, setDraggingRoute] = useState<{ route: PreparedRoute; fromDate: string } | null>(null);
    const [dragOverDate, setDragOverDate] = useState<string | null>(null);
    const [dragMoving, setDragMoving] = useState(false);

    /* --- Modals --- */
    const [newSaleModal, setNewSaleModal] = useState(false);
    const [scheduleModal, setScheduleModal] = useState(false);
    const [batchScheduleModal, setBatchScheduleModal] = useState(false);
    const [driverModal, setDriverModal] = useState(false);
    const [deleteModal, setDeleteModal] = useState(false);
    const [routeDeleteModal, setRouteDeleteModal] = useState(false);
    const [routeDetailModal, setRouteDetailModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    /* --- Form State --- */
    const [selectedCustomer, setSelectedCustomer] = useState<number | "">("");
    const [selectedCustomerObj, setSelectedCustomerObj] = useState<Customer | null>(null);
    const [customerSearch, setCustomerSearch] = useState("");
    const [customerSearching, setCustomerSearching] = useState(false);
    const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<number | "">("");
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
    const [productSearch, setProductSearch] = useState("");
    const [productSearching, setProductSearching] = useState(false);
    const [productDropdownOpen, setProductDropdownOpen] = useState(false);
    const [assignedAt, setAssignedAt] = useState(new Date().toISOString().split("T")[0]);
    const [notes, setNotes] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [scheduleDate, setScheduleDate] = useState("");
    const [scheduleAssignmentId, setScheduleAssignmentId] = useState<number | null>(null);
    const [selectedDriverId, setSelectedDriverId] = useState<number | "">("");
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [routeDeleteTarget, setRouteDeleteTarget] = useState<PreparedRoute | null>(null);
    const [routeDetailTarget, setRouteDetailTarget] = useState<PreparedRoute | null>(null);

    /* ============ Data Fetching ============ */
    useEffect(() => { fetchAll(); }, []);
    useEffect(() => { if (mainTab === 'planning') fetchDeliveries(); }, [planningDate, mainTab]);
    useEffect(() => {
        if (!newSaleModal) return;
        const query = customerSearch.trim();
        if (!query) {
            setCustomers([]);
            setCustomerSearching(false);
            return;
        }

        const timer = window.setTimeout(async () => {
            try {
                setCustomerSearching(true);
                const res = await customerAPI.list({
                    starts_with: query,
                    page_size: 20,
                    ordering: "first_name",
                });
                setCustomers(Array.isArray(res.data) ? res.data : res.data.results || []);
            } catch {
                setCustomers([]);
            } finally {
                setCustomerSearching(false);
            }
        }, 250);

        return () => window.clearTimeout(timer);
    }, [customerSearch, newSaleModal]);
    useEffect(() => {
        if (!newSaleModal) return;
        const query = productSearch.trim();
        if (!query && !selectedCategoryId) {
            setProducts([]);
            setProductSearching(false);
            return;
        }

        const timer = window.setTimeout(async () => {
            try {
                setProductSearching(true);
                const res = await productAPI.list({
                    search: query || undefined,
                    category: selectedCategoryId || undefined,
                    page_size: 20,
                });
                setProducts(Array.isArray(res.data) ? res.data : res.data.results || []);
            } catch {
                setProducts([]);
            } finally {
                setProductSearching(false);
            }
        }, 250);

        return () => window.clearTimeout(timer);
    }, [productSearch, selectedCategoryId, newSaleModal]);

    const fetchAll = async () => {
        try {
            setLoading(true);
            const [assignRes, statsRes, categoryRes, driverRes, depotRes, routeRes] = await Promise.all([
                assignmentAPI.list({ status: 'PLANNED', page_size: 1000 }),
                assignmentAPI.stats(),
                categoryAPI.list({ page_size: 1000 }),
                api.get("/users/?role=delivery"),
                api.get("/depots/"),
                deliveryRouteAPI.list({ page_size: 50 }),
            ]);
            setAssignments(Array.isArray(assignRes.data) ? assignRes.data : assignRes.data.results || []);
            setStats(statsRes.data);
            setCategories(Array.isArray(categoryRes.data) ? categoryRes.data : categoryRes.data.results || []);
            setDrivers(Array.isArray(driverRes.data) ? driverRes.data : driverRes.data.results || []);
            const depotList = Array.isArray(depotRes.data) ? depotRes.data : depotRes.data.results || [];
            setDepots(depotList);
            const defaultDepot = depotList.find((depot: DepotOption) => depot.is_default);
            if (!selectedDepotId && defaultDepot) setSelectedDepotId(defaultDepot.id);
            const routeList = Array.isArray(routeRes.data) ? routeRes.data : routeRes.data.results || [];
            setPreparedRoutes(routeList.sort((a: PreparedRoute, b: PreparedRoute) => {
                const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
                return dateDiff || b.id - a.id;
            }));
        } catch { showToast("error", t('assignments.loadError')); }
        finally { setLoading(false); }
    };

    const fetchDeliveries = async () => {
        try {
            const res = await deliveryAPI.byDate(planningDate);
            setDeliveries(Array.isArray(res.data) ? res.data : res.data.results || []);
            setRouteResult(null);
            setSelectedDeliveries([]);
        } catch { /* no deliveries for this date */ setDeliveries([]); }
    };

    /* ============ Helpers ============ */
    const showToast = (type: ToastType, message: string) => {
        setToasts(p => [...p, { id: Date.now().toString(), type, message }]);
    };
    const removeToast = (id: string) => setToasts(p => p.filter(t => t.id !== id));

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    };
    
    const formatDeliveryStatus = (status?: string, defaultDisplay?: string) => {
        if (!status) return "-";
        switch(status) {
            case 'WAITING': return t('deliveries.statusWaiting');
            case 'OUT_FOR_DELIVERY': return t('deliveries.statusOut');
            case 'DELIVERED': return t('deliveries.statusDelivered');
            case 'FAILED': return t('deliveries.statusFailed');
            case 'PLANNED': return t('deliveries.statusPlanned');
            case 'IN_PROGRESS': return t('deliveries.statusInProgress');
            case 'COMPLETED': return t('deliveries.statusCompleted');
            default: return defaultDisplay || status || "-";
        }
    };

    const formatDuration = (minutes?: number) => {
        if (!minutes) return `0 ${t('assignments.min')}`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours ? `${hours} ${t('assignments.hour')} ${mins} ${t('assignments.min')}` : `${mins} ${t('assignments.min')}`;
    };
    const formatCustomerLabel = (customer: Customer) => {
        const name = customer.full_name || `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.username;
        return `${name} (${customer.username})`;
    };
    const formatProductLabel = (product: Product) => {
        const model = product.model_code ? ` - ${product.model_code}` : "";
        return `${product.name}${model}`;
    };
    const weekdayOptions = [
        { id: 0, label: t('assignments.dayMon') },
        { id: 1, label: t('assignments.dayTue') },
        { id: 2, label: t('assignments.dayWed') },
        { id: 3, label: t('assignments.dayThu') },
        { id: 4, label: t('assignments.dayFri') },
        { id: 5, label: t('assignments.daySat') },
        { id: 6, label: t('assignments.daySun') },
    ];
    const toggleWeekday = (day: number) => {
        setSelectedWeekdays(prev =>
            prev.includes(day) ? prev.filter(item => item !== day) : [...prev, day].sort((a, b) => a - b)
        );
    };
    const toLocalDateInput = (value: Date) => {
        const copy = new Date(value);
        copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
        return copy.toISOString().split("T")[0];
    };
    const rollingWeekDays = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentWeekday = (today.getDay() + 6) % 7;
        return weekdayOptions.map(day => {
            const dateValue = new Date(today);
            const diff = (day.id - currentWeekday + 7) % 7;
            dateValue.setDate(today.getDate() + diff);
            const isoDate = toLocalDateInput(dateValue);
            return {
                ...day,
                date: isoDate,
                displayDate: dateValue.toLocaleDateString(i18n.language === 'tr' ? 'tr-TR' : 'en-US', { day: '2-digit', month: 'short' }),
                isToday: diff === 0,
                isActive: selectedWeekdays.includes(day.id),
            };
        });
    }, [selectedWeekdays]);
    const routesByDate = useMemo(() => {
        return preparedRoutes.reduce<Record<string, PreparedRoute[]>>((acc, route) => {
            acc[route.date] = [...(acc[route.date] || []), route];
            return acc;
        }, {});
    }, [preparedRoutes]);
    const calendarWeekStart = rollingWeekDays.reduce(
        (earliest, day) => day.date < earliest ? day.date : earliest,
        rollingWeekDays[0]?.date || new Date().toISOString().split("T")[0]
    );

    /* --- Unscheduled assignments (status=PLANNED and no delivery) --- */
    const unscheduledAssignments = useMemo(() => {
        let list = assignments.filter(a => a.status === 'PLANNED' && !a.delivery_info?.scheduled_date);
        if (searchUnscheduled) {
            const t = searchUnscheduled.toLowerCase();
            list = list.filter(a =>
                a.customer?.first_name?.toLowerCase().includes(t) ||
                a.customer?.last_name?.toLowerCase().includes(t) ||
                a.customer?.username?.toLowerCase().includes(t) ||
                a.product?.name?.toLowerCase().includes(t) ||
                a.product?.model_code?.toLowerCase().includes(t)
            );
        }
        return list;
    }, [assignments, searchUnscheduled]);

    /* --- Planning deliveries filtered by search --- */
    const filteredDeliveries = useMemo(() => {
        if (!searchPlanning) return deliveries;
        const t = searchPlanning.toLowerCase();
        return deliveries.filter(d =>
            d.customer_name?.toLowerCase().includes(t) ||
            d.product_name?.toLowerCase().includes(t) ||
            d.customer_address?.toLowerCase().includes(t)
        );
    }, [deliveries, searchPlanning]);

    /* ============ Actions ============ */

    const rebalanceWeeklyCalendar = async (weekdays = selectedWeekdays, showSuccess = true) => {
        if (!weekdays.length) {
            showToast("error", t('assignments.errAtLeastOneDay'));
            return;
        }
        setCalendarRebalancing(true);
        try {
            const res = await deliveryRouteAPI.rebalanceWeek({
                week_start: calendarWeekStart,
                allowed_weekdays: weekdays,
                max_hours_per_day: maxHoursPerDay,
                depot_id: selectedDepotId,
            });
            if (showSuccess) showToast("success", res.data.message || t('assignments.calendarRebalanced'));
            await fetchAll();
            if (mainTab === 'planning') fetchDeliveries();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.errCalendarRebalance'));
        } finally {
            setCalendarRebalancing(false);
        }
    };

    const toggleCalendarDay = (day: number) => {
        const next = selectedWeekdays.includes(day)
            ? selectedWeekdays.filter(item => item !== day)
            : [...selectedWeekdays, day].sort((a, b) => a - b);
        if (!next.length) {
            showToast("error", t('assignments.errAtLeastOneDayRemain'));
            return;
        }
        setSelectedWeekdays(next);
        rebalanceWeeklyCalendar(next);
    };

    /* --- Drag & Drop handlers --- */
    const handleDragStart = (route: PreparedRoute, fromDate: string) => {
        setDraggingRoute({ route, fromDate });
    };
    const handleDragEnd = () => {
        setDraggingRoute(null);
        setDragOverDate(null);
    };
    const handleCalendarDrop = async (toDate: string, toDateIsActive: boolean) => {
        if (!draggingRoute) return;
        setDraggingRoute(null);
        setDragOverDate(null);

        if (!toDateIsActive) {
            showToast("error", t('assignments.errDayClosed'));
            return;
        }
        if (draggingRoute.fromDate === toDate) return;

        const { route, fromDate } = draggingRoute;

        // Sürüklenen rotanın teslimat ID'leri
        const movedDeliveryIds = route.stops
            .map(s => s.delivery?.id)
            .filter((id): id is number => Boolean(id));

        if (!movedDeliveryIds.length) {
            showToast("error", t('assignments.errNoDeliveryInRoute'));
            return;
        }

        // Hedef günde mevcut rota(lar) varsa bunları da birleştireceğiz
        const existingTargetRoutes = routesByDate[toDate] || [];
        const existingDeliveryIds = existingTargetRoutes
            .flatMap(r => r.stops?.map(s => s.delivery?.id).filter((id): id is number => Boolean(id)) || []);
        const existingRouteIds = existingTargetRoutes.map(r => r.id);

        setDragMoving(true);
        try {
            // 1. Sürüklenen rotayı sil (teslimatlar → WAITING)
            await deliveryRouteAPI.delete(route.id);

            // 2. Hedef günün mevcut rotalarını sil (birleştirmek için)
            if (existingRouteIds.length) {
                await Promise.all(existingRouteIds.map(id => deliveryRouteAPI.delete(id)));
            }

            // 3. Taşınan teslimatların tarihini güncelle
            await Promise.all(movedDeliveryIds.map(id => deliveryAPI.update(id, { scheduled_date: toDate })));

            // 4. Hedef günün TÜM teslimatlarını (taşınan + mevcut) birlikte optimize et
            const allDeliveryIds = [...movedDeliveryIds, ...existingDeliveryIds];
            await deliveryRouteAPI.optimize({
                date: toDate,
                delivery_ids: allDeliveryIds,
                depot_id: selectedDepotId || undefined,
            } as any);

            const movedCount = movedDeliveryIds.length;
            const mergedCount = existingDeliveryIds.length;
            const mergeNote = mergedCount > 0 ? ` (mevcut ${mergedCount} teslimatla birleştirildi)` : "";
            showToast("success", t('assignments.deliveryMoved', { count: movedCount, from: formatDate(fromDate), to: formatDate(toDate) }) + mergeNote);
            fetchAll();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.errMoveDelivery'));
            fetchAll();
        } finally {
            setDragMoving(false);
        }
    };

    const autoPlaceNewAssignment = async (assignmentId: number) => {
        if (!selectedDepotId) {
            return;
        }
        const planRes = await assignmentAPI.autoPlan({
            start_date: calendarWeekStart,
            allowed_weekdays: selectedWeekdays,
            max_hours_per_day: maxHoursPerDay,
            depot_id: selectedDepotId,
            assignment_ids: [assignmentId],
        });
        const plan = planRes.data;
        if (!plan?.days?.length) return;
        await assignmentAPI.approvePlan(plan.days, plan.summary);
    };

    /* --- New Sale --- */
    const handleCreateAssignment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomer) {
            showToast("error", "Lutfen listeden bir musteri secin.");
            return;
        }
        if (!selectedProduct) {
            showToast("error", "Lutfen listeden bir urun secin.");
            return;
        }
        setSubmitting(true);
        try {
            const createRes = await assignmentAPI.create({
                customer_id: selectedCustomer, product_id: selectedProduct,
                assigned_at: assignedAt, quantity, notes, status: 'PLANNED'
            });
            const assignmentId = createRes.data?.id;
            if (!assignmentId) {
                throw new Error("Olusturulan atama kimligi alinamadi.");
            }
            await autoPlaceNewAssignment(assignmentId);
            showToast("success", t('assignments.createSuccess'));
            setNewSaleModal(false);
            resetSaleForm();
            await fetchAll();
            showToast("success", t('assignments.saleAutoPlanned'));
        } catch (err: any) {
            showToast("error", err.response?.data?.detail || err.message || t('assignments.createError'));
        } finally { setSubmitting(false); }
    };

    const resetSaleForm = () => {
        setSelectedCustomer(""); setSelectedProduct("");
        setSelectedCustomerObj(null);
        setCustomerSearch("");
        setCustomers([]);
        setCustomerDropdownOpen(false);
        setSelectedCategoryId("");
        setProductSearch("");
        setProducts([]);
        setProductDropdownOpen(false);
        setAssignedAt(new Date().toISOString().split("T")[0]);
        setNotes(""); setQuantity(1);
    };

    /* --- Schedule Single --- */
    const openScheduleModal = (assignmentId: number) => {
        setScheduleAssignmentId(assignmentId);
        setScheduleDate(new Date().toISOString().split("T")[0]);
        setScheduleModal(true);
    };

    const handleScheduleSingle = async () => {
        if (!scheduleAssignmentId || !scheduleDate) return;
        setSubmitting(true);
        try {
            await assignmentAPI.scheduleDelivery(scheduleAssignmentId, scheduleDate);
            showToast("success", t('assignments.scheduleSuccess'));
            setScheduleModal(false);
            fetchAll();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.scheduleError'));
        } finally { setSubmitting(false); }
    };

    /* --- Batch Schedule --- */
    const handleBatchSchedule = async () => {
        if (!selectedUnscheduled.length || !scheduleDate) return;
        setSubmitting(true);
        try {
            await assignmentAPI.batchSchedule(selectedUnscheduled, scheduleDate);
            showToast("success", t('assignments.batchScheduleSuccess', { count: selectedUnscheduled.length }));
            setBatchScheduleModal(false);
            setSelectedUnscheduled([]);
            fetchAll();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.batchScheduleError'));
        } finally { setSubmitting(false); }
    };

    /* --- Optimize Route --- */
    const handleOptimize = async () => {
        if (!selectedDeliveries.length) {
            showToast("error", t('assignments.optimizeWarning'));
            return;
        }
        setOptimizing(true);
        try {
            const res = await deliveryRouteAPI.optimize({
                delivery_ids: selectedDeliveries, date: planningDate
            });
            setRouteResult(res.data);
            showToast("success", t('assignments.optimizeSuccess', { stops: res.data.stop_count, distance: res.data.total_distance_km }));
            if (res.data.warnings?.no_coordinates?.length) {
                showToast("error", t('assignments.optimizeNoCoord', { count: res.data.warnings.no_coordinates.length }));
            }
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.optimizeError'));
        } finally { setOptimizing(false); }
    };

    /* --- Assign Driver --- */
    const handleAssignDriver = async () => {
        if (!selectedDriverId || !selectedDeliveries.length) return;
        setSubmitting(true);
        try {
            const res = await deliveryAPI.assignDriver(selectedDeliveries, Number(selectedDriverId));
            showToast("success", res.data.message || t('assignments.assignSuccess'));
            setDriverModal(false);
            setSelectedDriverId("");
            fetchDeliveries();
            fetchAll();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.assignError'));
        } finally { setSubmitting(false); }
    };

    const openPreparedRoute = (route: PreparedRoute) => {
        setPlanningDate(route.date);
        setMainTab('planning');
        setExpandedPreparedRoute(route.id);
    };

    const openPreparedRouteDriverModal = (route: PreparedRoute) => {
        setSelectedDeliveries(route.stops.map(stop => stop.delivery.id));
        setSelectedDriverId(route.assigned_driver || "");
        setDriverModal(true);
    };

    const openRouteDetailModal = (route: PreparedRoute) => {
        setRouteDetailTarget(route);
        setRouteDetailModal(true);
    };

    const closeRouteDetailModal = () => {
        setRouteDetailModal(false);
        setRouteDetailTarget(null);
    };

    const handleAssignRouteDriverFromDetail = async () => {
        if (!routeDetailTarget || !selectedDriverId) return;
        setSubmitting(true);
        try {
            const deliveryIds = routeDetailTarget.stops.map(stop => stop.delivery.id);
            const res = await deliveryAPI.assignDriver(deliveryIds, Number(selectedDriverId));
            showToast("success", res.data.message || t('assignments.assignSuccess'));
            setSelectedDriverId("");
            closeRouteDetailModal();
            fetchAll();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.assignError'));
        } finally { setSubmitting(false); }
    };

    const openPreparedRouteDeleteModal = (route: PreparedRoute) => {
        setRouteDeleteTarget(route);
        setRouteDeleteModal(true);
    };

    /* --- Delete --- */
    const handleDelete = async () => {
        if (!deleteId) return;
        setSubmitting(true);
        try {
            await assignmentAPI.delete(deleteId);
            showToast("success", t('assignments.deleteSuccess'));
            setDeleteModal(false);
            setDeleteId(null);
            fetchAll();
        } catch { showToast("error", t('assignments.deleteError')); }
        finally { setSubmitting(false); }
    };

    const handleDeletePreparedRoute = async () => {
        if (!routeDeleteTarget) return;
        setSubmitting(true);
        try {
            await deliveryRouteAPI.delete(routeDeleteTarget.id);
            showToast("success", t('assignments.planDeleted'));
            setRouteDeleteModal(false);
            setRouteDeleteTarget(null);
            if (expandedPreparedRoute === routeDeleteTarget.id) setExpandedPreparedRoute(null);
            fetchAll();
            if (mainTab === 'planning' && planningDate === routeDeleteTarget.date) fetchDeliveries();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.errPlanDelete'));
        } finally { setSubmitting(false); }
    };

    /* --- Auto Plan --- */
    const handleAutoPlan = async () => {
        setAutoPlanLoading(true);
        setAutoPlanData(null);
        setExpandedDay(null);
        try {
            const ids = selectedUnscheduled.length ? selectedUnscheduled : unscheduledAssignments.map(item => item.id);
            const res = await assignmentAPI.autoPlan({
                start_date: calendarWeekStart,
                allowed_weekdays: selectedWeekdays,
                max_hours_per_day: maxHoursPerDay,
                depot_id: selectedDepotId,
                assignment_ids: ids,
            });
            setAutoPlanData(res.data);
            setAutoPlanModal(true);
            if (res.data.warnings?.no_coordinates?.length) {
                showToast("error", t('assignments.autoPlanWarningNoCoord', { count: res.data.warnings.no_coordinates.length }));
            }
            if (res.data.warnings?.over_time_days?.length) {
                showToast("error", t('assignments.autoPlanWarningOverTime'));
            }
        } catch (err: any) {
            const errData = err.response?.data;
            const noCoords = errData?.warnings?.no_coordinates?.length ?? 0;
            if (noCoords > 0) {
                showToast("error", errData?.error || t('assignments.errMissingCoord', { count: noCoords }));
            } else {
                showToast("error", errData?.error || t('assignments.autoPlanEmpty'));
            }
        } finally { setAutoPlanLoading(false); }
    };

    const handleApprovePlan = async () => {
        if (!autoPlanData?.days) return;
        setAutoPlanApproving(true);
        try {
            const res = await assignmentAPI.approvePlan(autoPlanData.days, autoPlanData.summary);
            showToast("success", t('assignments.autoPlanApproveSuccess', { count: res.data.total_routes }));
            setAutoPlanModal(false);
            setAutoPlanData(null);
            fetchAll();
            if (mainTab === 'planning') fetchDeliveries();
        } catch (err: any) {
            showToast("error", err.response?.data?.error || t('assignments.autoPlanApproveError'));
        } finally { setAutoPlanApproving(false); }
    };

    /* --- Selection helpers --- */
    const toggleUnscheduled = (id: number) => {
        setSelectedUnscheduled(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    };
    const toggleAllUnscheduled = () => {
        setSelectedUnscheduled(p => p.length === unscheduledAssignments.length ? [] : unscheduledAssignments.map(a => a.id));
    };
    const toggleDelivery = (id: number) => {
        setSelectedDeliveries(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    };
    const toggleAllDeliveries = () => {
        setSelectedDeliveries(p => p.length === filteredDeliveries.length ? [] : filteredDeliveries.map(d => d.id));
    };

    /* ============ Render ============ */
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

            {/* Drag-move loading overlay */}
            {dragMoving && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-white rounded-xl px-8 py-6 shadow-2xl flex items-center gap-4">
                        <Loader2 className="animate-spin text-blue-600" size={28} />
                        <span className="text-base font-semibold text-gray-800">{t('assignments.movingDelivery')}</span>
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* ===== HEADER ===== */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                    <div className="px-8 py-5 flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <Package className="text-blue-600" /> {t('assignments.title')}
                            </h1>
                            <p className="text-sm text-gray-500 mt-1">
                                {t('assignments.subtitle')}
                            </p>
                        </div>
                        <button onClick={() => setNewSaleModal(true)}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
                            <Plus size={18} /> {t('assignments.newSale')}
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-[1920px] mx-auto space-y-6">

                        {/* ===== KPI CARDS ===== */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {[
                                { label: t('assignments.kpiUnscheduled'), value: stats.planned, color: "blue", icon: <Calendar size={20} /> },
                                { label: t('assignments.kpiScheduled'), value: stats.scheduled, color: "orange", icon: <Truck size={20} /> },
                                { label: t('assignments.kpiOutForDelivery'), value: stats.out_for_delivery, color: "purple", icon: <Navigation size={20} /> },
                                { label: t('assignments.kpiDelivered'), value: stats.delivered, color: "green", icon: <CheckCircle size={20} /> },
                            ].map((card) => (
                                <div key={card.label} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-gray-500">{card.label}</p>
                                            <h3 className="text-2xl font-bold text-gray-900 mt-1">{card.value}</h3>
                                        </div>
                                        <div className={`p-2 bg-${card.color}-50 text-${card.color}-600 rounded-lg`}>
                                            {card.icon}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ===== PLANNING CENTER ===== */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <div className="flex flex-col xl:flex-row xl:items-start gap-6">

                                {/* Pool stat */}
                                <div className="min-w-[200px]">
                                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                        <Route size={18} className="text-emerald-600" />
                                        {t('assignments.planningCenter')}
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Yeni satışlar otomatik olarak takvime eklenir. {t('assignments.deliveryDays')}ni
                                        değiştirince planı yeniden dağıtabilirsiniz.
                                    </p>
                                    <div className="mt-4">
                                        {unscheduledAssignments.length > 0 ? (
                                            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                                <AlertCircle size={18} className="shrink-0 text-amber-500" />
                                                <div>
                                                    <p className="text-lg font-bold text-amber-700 leading-tight">{unscheduledAssignments.length} planlanmamış sipariş</p>
                                                    <p className="text-xs text-amber-600">Otomatik yerleştirilemedi — aşağıdaki butonla planlayın.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                                                <CheckCircle size={18} className="shrink-0 text-emerald-500" />
                                                <p className="text-sm font-medium text-emerald-700">{t('assignments.allOrdersPlanned')}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="border-l border-gray-100 self-stretch hidden xl:block" />

                                {/* Config + actions */}
                                <div className="flex-1">
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{t('assignments.maxHoursPerDay')}</label>
                                            <input type="number" min={1} max={14} step={0.5} value={maxHoursPerDay}
                                                onChange={(e) => setMaxHoursPerDay(Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{t('assignments.departureDepot')}</label>
                                            <select value={selectedDepotId}
                                                onChange={(e) => setSelectedDepotId(e.target.value ? Number(e.target.value) : "")}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                                                <option value="">Varsayılan depo</option>
                                                {depots.map(depot => <option key={depot.id} value={depot.id}>{depot.name}{depot.is_default ? " (varsayılan)" : ""}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{t('assignments.deliveryDays')}</label>
                                            <div className="flex flex-wrap gap-1">
                                                {weekdayOptions.map(day => (
                                                    <button key={day.id} type="button" onClick={() => toggleCalendarDay(day.id)}
                                                        disabled={calendarRebalancing}
                                                        className={`px-2 py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 ${selectedWeekdays.includes(day.id)
                                                            ? "bg-emerald-600 text-white border-emerald-600"
                                                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                                                        {day.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        {/* Güvenlik ağı: yalnızca otomatik yerleştirilemeyen sipariş varsa görünür */}
                                        {unscheduledAssignments.length > 0 && (
                                            <button onClick={handleAutoPlan}
                                                disabled={autoPlanLoading}
                                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm">
                                                {autoPlanLoading ? <Loader2 className="animate-spin" size={16} /> : <Route size={16} />}
                                                {autoPlanLoading
                                                    ? "Plan oluşturuluyor..."
                                                    : `Bekleyenleri Planla (${unscheduledAssignments.length})`}
                                            </button>
                                        )}
                                        <div className="flex flex-col">
                                            <button onClick={() => rebalanceWeeklyCalendar()}
                                                disabled={calendarRebalancing || !selectedWeekdays.length}
                                                className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
                                                {calendarRebalancing ? <Loader2 className="animate-spin" size={16} /> : <Route size={16} />}
                                                {calendarRebalancing ? t('assignments.rebalancing') : t('assignments.rebalanceCurrentPlan')}
                                            </button>
                                            <span className="mt-1 text-xs text-gray-400 max-w-[260px]">
                                                {t('assignments.rebalanceDesc')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* ===== WEEKLY CALENDAR ===== */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                        <Calendar size={18} className="text-blue-600" />
                                        {t('assignments.weeklyDeliveryCalendar')}
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {t('assignments.calendarDesc')}
                                    </p>
                                </div>
                                <p className="text-sm text-gray-400 hidden lg:block">{t('assignments.weekOf', { date: calendarWeekStart })}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7">
                                {rollingWeekDays.map(day => {
                                    const dayRoutes = routesByDate[day.date] || [];
                                    const dayStops = dayRoutes.reduce((sum, route) => sum + (route.stop_count || route.stops?.length || 0), 0);
                                    const dayMinutes = dayRoutes.reduce((sum, route) => sum + Number(route.total_duration_min || 0), 0);
                                    const isDragOver = dragOverDate === day.date;
                                    return (
                                        <div
                                            key={day.id}
                                            className={`min-h-[260px] border-b border-r border-gray-100 p-4 transition-colors
                                                ${day.isActive ? "bg-white" : "bg-gray-50"}
                                                ${isDragOver ? "ring-2 ring-inset ring-blue-400 bg-blue-50/40" : ""}`}
                                            onDragOver={(e) => {
                                                if (draggingRoute && day.isActive) {
                                                    e.preventDefault();
                                                    setDragOverDate(day.date);
                                                }
                                            }}
                                            onDragLeave={(e) => {
                                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                    setDragOverDate(null);
                                                }
                                            }}
                                            onDrop={(e) => { e.preventDefault(); handleCalendarDrop(day.date, day.isActive); }}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-gray-900">{day.label}</h3>
                                                        {day.isToday && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{t('assignments.today')}</span>}
                                                    </div>
                                                    <p className="text-xs text-gray-500">{day.displayDate}</p>
                                                </div>
                                                <button type="button" onClick={() => toggleCalendarDay(day.id)} disabled={calendarRebalancing}
                                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors disabled:opacity-50 ${day.isActive
                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                        : "bg-white text-gray-500 border-gray-200"}`}>
                                                    {day.isActive ? t('assignments.active') : t('assignments.passive')}
                                                </button>
                                            </div>

                                            <div className="mt-4 space-y-2">
                                                {isDragOver && (
                                                    <div className={`rounded-lg border-2 border-dashed px-3 py-6 text-center text-xs font-semibold
                                                        ${dayRoutes.length > 0
                                                            ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                                                            : "border-blue-400 bg-blue-50 text-blue-600"}`}>
                                                        {dayRoutes.length > 0 ? `↓ Mevcut rotaya ekle (${dayRoutes.reduce((s, r) => s + (r.stop_count || r.stops?.length || 0), 0)} {t('assignments.stop')})` : t('assignments.dropHere')}
                                                    </div>
                                                )}
                                                {dayRoutes.length > 0 && day.isActive ? dayRoutes.map(route => (
                                                    <div
                                                        key={route.id}
                                                        draggable
                                                        onDragStart={(e) => { e.stopPropagation(); handleDragStart(route, day.date); }}
                                                        onDragEnd={handleDragEnd}
                                                        onClick={() => openRouteDetailModal(route)}
                                                        className="w-full rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 cursor-grab active:cursor-grabbing select-none"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-sm font-semibold text-gray-900">
                                                                {route.stop_count || route.stops?.length || 0} {t('assignments.stop')}
                                                            </span>
                                                            <span className="text-xs text-gray-500">{formatDuration(route.total_duration_min)}</span>
                                                        </div>
                                                        <div className="mt-1 text-xs text-gray-500">
                                                            {Number(route.total_distance_km || 0)} km
                                                        </div>
                                                        <div className={`mt-1.5 text-xs font-medium ${route.driver_name ? "text-emerald-700" : "text-amber-600"}`}>
                                                            {route.driver_name || t('assignments.noDriverAssigned')}
                                                        </div>
                                                    </div>
                                                )) : !isDragOver ? (
                                                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-sm text-gray-400">
                                                        {day.isActive ? t('assignments.noPlan') : t('assignments.closedForDelivery')}
                                                    </div>
                                                ) : null}
                                            </div>

                                            {dayRoutes.length > 0 && (
                                                <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                                    {dayStops} {t('assignments.deliveries')} • {formatDuration(dayMinutes)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ===== PREPARED ROUTES ===== */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                        <Navigation size={18} className="text-blue-600" />
                                        {t('assignments.preparedPlans')}
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {t('assignments.preparedPlansDesc')}
                                    </p>
                                </div>
                                <div className="text-sm text-gray-500">
                                    {preparedRoutes.length} plan listeleniyor
                                </div>
                            </div>

                            {preparedRoutes.length > 0 ? (
                                <div className="divide-y divide-gray-100">
                                    {preparedRoutes.slice(0, 8).map(route => {
                                        const isExpanded = expandedPreparedRoute === route.id;
                                        const stops = route.stops || [];
                                        const statusClass = route.status === 'COMPLETED'
                                            ? 'bg-green-50 text-green-700 border-green-200'
                                            : route.status === 'IN_PROGRESS'
                                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                : 'bg-amber-50 text-amber-700 border-amber-200';
                                        const statusLabel = route.status === 'COMPLETED'
                                            ? 'Tamamlandı'
                                            : route.status === 'IN_PROGRESS'
                                                ? 'Devam ediyor'
                                                : 'Planlandı';

                                        return (
                                            <div key={route.id} className="px-6 py-4">
                                                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                                    <button type="button" onClick={() => setExpandedPreparedRoute(isExpanded ? null : route.id)}
                                                        className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                                            {isExpanded ? <Lucide.ChevronDown size={18} /> : <Route size={18} />}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-semibold text-gray-900">{formatDate(route.date)}</span>
                                                                <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${statusClass}`}>
                                                                    {statusLabel}
                                                                </span>
                                                                {!route.driver_name && (
                                                                    <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 text-xs font-semibold">
                                                                        {t('assignments.noDriverAssigned')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                                                                <span>{route.stop_count || stops.length} {t('assignments.stop')}</span>
                                                                <span>{Number(route.total_distance_km || 0)} km</span>
                                                                <span>{formatDuration(route.total_duration_min)}</span>
                                                                <span>{route.driver_name || t('assignments.waitingAssignment')}</span>
                                                            </div>
                                                        </div>
                                                    </button>

                                                    <div className="flex flex-wrap gap-2">
                                                        <button type="button" onClick={() => openPreparedRoute(route)}
                                                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-semibold transition-colors">
                                                            <Calendar size={16} /> {t('assignments.openDate')}
                                                        </button>
                                                        <button type="button" onClick={() => openPreparedRouteDriverModal(route)} disabled={!stops.length}
                                                            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
                                                            <UserCheck size={16} /> {t('assignments.assignDriver')}
                                                        </button>
                                                        <button type="button" onClick={() => openPreparedRouteDeleteModal(route)}
                                                            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-semibold transition-colors">
                                                            <Trash2 size={16} /> {t('assignments.btnDelete')}
                                                        </button>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="mt-4 grid gap-2">
                                                        {stops.length > 0 ? stops.map(stop => (
                                                            <div key={stop.id} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                                                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-700 shadow-sm">
                                                                    {stop.stop_order}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-medium text-gray-900">{stop.delivery?.customer_name || 'Müşteri bilgisi yok'}</div>
                                                                    <div className="mt-0.5 text-xs text-gray-500 truncate">
                                                                        {stop.delivery?.product_name || t('assignments.product')} • {stop.delivery?.quantity || 1} {t('assignments.quantitySuffix')} • {stop.delivery?.customer_address || t('assignments.noAddress')}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2 text-xs text-gray-500 md:justify-end">
                                                                    <span className="rounded-full bg-white px-2 py-1">{Number(stop.distance_from_previous_km || 0)} km</span>
                                                                    <span className="rounded-full bg-white px-2 py-1">{stop.duration_from_previous_min || 0} {t('assignments.min')}</span>
                                                                    <span className="rounded-full bg-white px-2 py-1">{formatDeliveryStatus(stop.delivery?.status, stop.delivery?.status_display)}</span>
                                                                </div>
                                                            </div>
                                                        )) : (
                                                            <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
                                                                {t('assignments.noStopsInRoute')}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="px-6 py-10 text-center text-sm text-gray-500">
                                    {t('assignments.noPreparedPlans')}
                                </div>
                            )}
                        </div>

                        {false && (
                        <>
                        {/* ===== MAIN TABS ===== */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="border-b border-gray-200">
                                <div className="flex items-center justify-between px-6 py-4">
                                    <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                                        <button onClick={() => setMainTab('unscheduled')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mainTab === 'unscheduled' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                                            {t('assignments.tabUnscheduled')} ({unscheduledAssignments.length})
                                        </button>
                                        <button onClick={() => setMainTab('planning')}
                                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mainTab === 'planning' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                                            {t('assignments.tabPlanning')}
                                        </button>
                                    </div>

                                    {/* Search + Actions */}
                                    <div className="flex items-center gap-3">
                                        {mainTab === 'unscheduled' && (
                                            <div className="flex gap-2">
                                                {selectedUnscheduled.length > 0 && (
                                                    <button onClick={() => { setScheduleDate(new Date().toISOString().split("T")[0]); setBatchScheduleModal(true); }}
                                                        className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                        <Calendar size={16} /> {t('assignments.batchScheduleBtn')} ({selectedUnscheduled.length})
                                                    </button>
                                                )}
                                                {unscheduledAssignments.length > 0 && (
                                                    <button onClick={handleAutoPlan} disabled={autoPlanLoading}
                                                        className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50">
                                                        {autoPlanLoading ? <Loader2 className="animate-spin" size={16} /> : <Route size={16} />}
                                                        {autoPlanLoading ? t('assignments.autoPlanLoading') : t('assignments.autoPlanBtn')}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {mainTab === 'planning' && selectedDeliveries.length > 0 && (
                                            <div className="flex gap-2">
                                                <button onClick={handleOptimize} disabled={optimizing}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                                                    {optimizing ? <Loader2 className="animate-spin" size={16} /> : <Route size={16} />}
                                                    {t('assignments.optimizeRouteBtn')} ({selectedDeliveries.length})
                                                </button>
                                                <button onClick={() => { setSelectedDriverId(""); setDriverModal(true); }}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                                                    <UserCheck size={16} /> {t('assignments.assignDriverBtn')}
                                                </button>
                                            </div>
                                        )}
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input type="text"
                                                placeholder={t('assignments.searchPlaceholder')}
                                                value={mainTab === 'unscheduled' ? searchUnscheduled : searchPlanning}
                                                onChange={(e) => mainTab === 'unscheduled' ? setSearchUnscheduled(e.target.value) : setSearchPlanning(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm" />
                                        </div>
                                    </div>
                                </div>

                                {/* Date picker for planning tab */}
                                {mainTab === 'planning' && (
                                    <div className="px-6 pb-4 flex items-center gap-4">
                                        <label className="text-sm font-medium text-gray-600">{t('assignments.planningDateLabel')}</label>
                                        <input type="date" value={planningDate} onChange={(e) => setPlanningDate(e.target.value)}
                                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                                        <span className="text-sm text-gray-500">
                                            {deliveries.length} {t('assignments.deliveriesFound')}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* ===== TAB 1: UNSCHEDULED TABLE ===== */}
                            {mainTab === 'unscheduled' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-3 w-10">
                                                    <input type="checkbox" checked={selectedUnscheduled.length === unscheduledAssignments.length && unscheduledAssignments.length > 0}
                                                        onChange={toggleAllUnscheduled} className="rounded border-gray-300" />
                                                </th>
                                                <th className="px-6 py-3">{t('assignments.colCustomer')}</th>
                                                <th className="px-6 py-3">{t('assignments.colProduct')}</th>
                                                <th className="px-6 py-3">{t('assignments.colSaleDate')}</th>
                                                <th className="px-6 py-3">{t('assignments.colStatus')}</th>
                                                <th className="px-6 py-3 text-right">{t('assignments.colActions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {unscheduledAssignments.length > 0 ? unscheduledAssignments.map(a => (
                                                <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <input type="checkbox" checked={selectedUnscheduled.includes(a.id)}
                                                            onChange={() => toggleUnscheduled(a.id)} className="rounded border-gray-300" />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{a.customer?.first_name} {a.customer?.last_name}</div>
                                                        <div className="text-xs text-gray-500">{a.customer?.username}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{a.product?.name}</div>
                                                        <div className="text-xs text-gray-500">{a.product?.model_code} • {a.quantity} {t('assignments.saleQuantity')}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500">{formatDate(a.assigned_at)}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-yellow-50 text-yellow-700 border-yellow-200">
                                                            {t('assignments.statusWaitingDate')}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => openScheduleModal(a.id)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 font-medium text-xs transition-colors">
                                                                <Calendar size={14} /> {t('assignments.btnSetDate')}
                                                            </button>
                                                            <button onClick={() => { setDeleteId(a.id); setDeleteModal(true); }}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">{t('assignments.allScheduledMsg')}</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ===== TAB 2: PLANNING TABLE ===== */}
                            {mainTab === 'planning' && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-3 w-10">
                                                    <input type="checkbox" checked={selectedDeliveries.length === filteredDeliveries.length && filteredDeliveries.length > 0}
                                                        onChange={toggleAllDeliveries} className="rounded border-gray-300" />
                                                </th>
                                                <th className="px-6 py-3">{t('assignments.colOrder')}</th>
                                                <th className="px-6 py-3">{t('assignments.colCustomer')}</th>
                                                <th className="px-6 py-3">{t('assignments.colProduct')}</th>
                                                <th className="px-6 py-3">{t('assignments.colAddress')}</th>
                                                <th className="px-6 py-3">{t('assignments.colStatus')}</th>
                                                <th className="px-6 py-3">{t('assignments.colDriver')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredDeliveries.length > 0 ? filteredDeliveries.map(d => (
                                                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <input type="checkbox" checked={selectedDeliveries.includes(d.id)}
                                                            onChange={() => toggleDelivery(d.id)} className="rounded border-gray-300" />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                                                            {d.delivery_order || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{d.customer_name}</div>
                                                        <div className="text-xs text-gray-500">{d.customer_phone}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{d.product_name}</div>
                                                        <div className="text-xs text-gray-500">{d.product_model_code} • {d.quantity} {t('assignments.saleQuantity')}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-gray-600 max-w-xs truncate" title={d.customer_address}>
                                                            <MapPin size={12} className="inline mr-1" />{d.customer_address || t('assignments.noAddress')}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${d.status === 'WAITING' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                                                            d.status === 'OUT_FOR_DELIVERY' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                d.status === 'DELIVERED' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                    'bg-red-50 text-red-700 border-red-200'
                                                            }`}>{formatDeliveryStatus(d.status, d.status_display)}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-600">
                                                        {d.driver_name || <span className="text-gray-400">{t('assignments.noDriver')}</span>}
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                                    {t('assignments.noDeliveriesMsg')}
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* ===== ROUTE RESULT PANEL ===== */}
                        {routeResult && mainTab === 'planning' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 bg-green-50">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <Route size={20} className="text-green-600" /> {t('assignments.routeTitle')}
                                    </h3>
                                </div>
                                <div className="p-6">
                                    {/* KPIs */}
                                    <div className="grid grid-cols-3 gap-4 mb-6">
                                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                                            <p className="text-sm text-blue-600 font-medium">{t('assignments.totalDistance')}</p>
                                            <p className="text-2xl font-bold text-blue-800">{routeResult.total_distance_km} km</p>
                                        </div>
                                        <div className="bg-orange-50 rounded-xl p-4 text-center">
                                            <p className="text-sm text-orange-600 font-medium">{t('assignments.estimatedTime')}</p>
                                            <p className="text-2xl font-bold text-orange-800">
                                                {Math.floor(routeResult.total_duration_min / 60)} {t('assignments.hour')} {routeResult.total_duration_min % 60} {t('assignments.min')}
                                            </p>
                                        </div>
                                        <div className="bg-green-50 rounded-xl p-4 text-center">
                                            <p className="text-sm text-green-600 font-medium">{t('assignments.stopCount')}</p>
                                            <p className="text-2xl font-bold text-green-800">{routeResult.stop_count}</p>
                                        </div>
                                    </div>

                                    {/* Route Stops */}
                                    <div className="space-y-2">
                                        {routeResult.stops.map((stop, idx) => (
                                            <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                                                    {stop.stop_order}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900">{stop.customer_name}</p>
                                                    <p className="text-xs text-gray-500">{stop.product_name}</p>
                                                </div>
                                                <div className="text-right text-sm">
                                                    <p className="text-gray-700 font-medium">{stop.distance_from_previous_km} km</p>
                                                    <p className="text-xs text-gray-500">{stop.duration_from_previous_min} {t('assignments.min')}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        </>
                        )}
                    </div>
                </main>

                {/* ===================== MODALS ===================== */}

                {/* New Sale Modal */}
                {newSaleModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">{t('assignments.newSaleTitle')}</h3>
                                <button onClick={() => setNewSaleModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>
                            <form onSubmit={handleCreateAssignment} className="p-6 space-y-4">
                                <div className="relative">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignments.saleCustomer')}</label>
                                    <input
                                        value={customerSearch}
                                        onChange={(e) => {
                                            setCustomerSearch(e.target.value);
                                            setSelectedCustomer("");
                                            setSelectedCustomerObj(null);
                                            setCustomerDropdownOpen(true);
                                        }}
                                        onFocus={() => setCustomerDropdownOpen(true)}
                                        placeholder={t('assignments.plcCustomerSearch')}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    />
                                    {customerDropdownOpen && customerSearch.trim() && (
                                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                                            {customerSearching ? (
                                                <div className="px-3 py-3 text-sm text-gray-500 flex items-center gap-2">
                                                    <Loader2 className="animate-spin" size={16} /> {t('assignments.searching')}
                                                </div>
                                            ) : customers.length ? (
                                                customers.map(c => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedCustomer(c.id);
                                                            setSelectedCustomerObj(c);
                                                            setCustomerSearch(formatCustomerLabel(c));
                                                            setCustomerDropdownOpen(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                                                    >
                                                        <div className="font-medium text-gray-900">{c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.username}</div>
                                                        <div className="text-xs text-gray-500">{c.username}{c.phone_number ? ` • ${c.phone_number}` : ""}</div>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-3 py-3 text-sm text-gray-500">{t('assignments.noMatchingCustomer')}</div>
                                            )}
                                        </div>
                                    )}
                                    {!selectedCustomer && customerSearch.trim() && !customerDropdownOpen && (
                                        <p className="mt-1 text-xs text-red-600">Listeden bir müşteri seçin.</p>
                                    )}
                                    {selectedCustomerObj && !selectedCustomerObj.address_lat && (
                                        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                                            <span>
                                                Bu müşterinin harita koordinatı eksik. Müşteri profilinden adres konumunu belirleyin; koordinat olmadan sipariş teslimata dahil edilemez.
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignments.saleProduct')}</label>
                                    <select
                                        value={selectedCategoryId}
                                        onChange={(e) => {
                                            setSelectedCategoryId(e.target.value ? Number(e.target.value) : "");
                                            setSelectedProduct("");
                                            setProductSearch("");
                                            setProductDropdownOpen(true);
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white"
                                    >
                                        <option value="">{t('assignments.allCategories')}</option>
                                        {categories.map(category => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}{typeof category.product_count === "number" ? ` (${category.product_count})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="relative">
                                        <input
                                            value={productSearch}
                                            onChange={(e) => {
                                                setProductSearch(e.target.value);
                                                setSelectedProduct("");
                                                setProductDropdownOpen(true);
                                            }}
                                            onFocus={() => setProductDropdownOpen(true)}
                                            placeholder={t('assignments.plcProductSearch')}
                                            required
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                        />
                                        {productDropdownOpen && (productSearch.trim() || selectedCategoryId) && (
                                            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                                {productSearching ? (
                                                    <div className="px-3 py-3 text-sm text-gray-500 flex items-center gap-2">
                                                        <Loader2 className="animate-spin" size={16} /> {t('assignments.searchingProducts')}
                                                    </div>
                                                ) : products.length ? (
                                                    products.map(product => (
                                                        <button
                                                            key={product.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedProduct(product.id);
                                                                setProductSearch(formatProductLabel(product));
                                                                setProductDropdownOpen(false);
                                                            }}
                                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                                                        >
                                                            <div className="font-medium text-gray-900">{product.name}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {product.model_code || "{t('assignments.noModelCode')}"} • {product.category_name || product.category?.name || "{t('assignments.noCategory')}"} • {t('assignments.stockLabel')}: {product.stock ?? 0}
                                                            </div>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="px-3 py-3 text-sm text-gray-500">{t('assignments.noMatchingProduct')}</div>
                                                )}
                                            </div>
                                        )}
                                        {!selectedProduct && productSearch.trim() && !productDropdownOpen && (
                                            <p className="mt-1 text-xs text-red-600">{t('assignments.selectProductFromList')}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignments.saleDate')}</label>
                                        <input type="date" value={assignedAt} onChange={(e) => setAssignedAt(e.target.value)} required
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignments.saleQuantity')}</label>
                                        <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignments.saleNotes')}</label>
                                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('assignments.saleNotesPlaceholder')}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none min-h-[80px]" />
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setNewSaleModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">{t('assignments.cancel')}</button>
                                    <button type="submit" disabled={submitting || !!(selectedCustomerObj && !selectedCustomerObj.address_lat)}
                                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : t('assignments.save')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Schedule Single Modal */}
                {scheduleModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">{t('assignments.scheduleTitle')}</h3>
                                <button onClick={() => setScheduleModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignments.scheduleDate')} <span className="text-red-500">*</span></label>
                                    <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setScheduleModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">{t('assignments.cancel')}</button>
                                    <button onClick={handleScheduleSingle} disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : t('assignments.scheduleBtn')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Batch Schedule Modal */}
                {batchScheduleModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">{t('assignments.batchScheduleTitle')}</h3>
                                <button onClick={() => setBatchScheduleModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                                    <span className="font-bold">{selectedUnscheduled.length}</span> {t('assignments.batchDesc')}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignments.scheduleDate')} <span className="text-red-500">*</span></label>
                                    <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setBatchScheduleModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">{t('assignments.cancel')}</button>
                                    <button onClick={handleBatchSchedule} disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : t('assignments.scheduleAllBtn')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Assign Driver Modal */}
                {driverModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-900">{t('assignments.assignTitle')}</h3>
                                <button onClick={() => setDriverModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800">
                                    <span className="font-bold">{selectedDeliveries.length}</span> {t('assignments.assignDesc')}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('assignments.assignSelect')} <span className="text-red-500">*</span></label>
                                    <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
                                        <option value="">{t('assignments.assignSelectPlaceholder')}</option>
                                        {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} ({d.username})</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setDriverModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">{t('assignments.cancel')}</button>
                                    <button onClick={handleAssignDriver} disabled={submitting || !selectedDriverId}
                                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : t('assignments.assignConfirm')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Modal */}
                {deleteModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
                            <div className="p-6 text-center">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">{t('assignments.deleteTitle')}</h3>
                                <p className="text-gray-500 text-sm mb-6">{t('assignments.deleteDesc')}</p>
                                <div className="flex gap-3">
                                    <button onClick={() => setDeleteModal(false)}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">{t('assignments.cancel')}</button>
                                    <button onClick={handleDelete} disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : t('assignments.deleteConfirm')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Route Detail Modal */}
                {routeDetailModal && routeDetailTarget && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
                            <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-gray-50">
                                <div>
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <Route size={20} className="text-blue-600" />
                                        {t('assignments.routeOfDate', { date: formatDate(routeDetailTarget.date) })}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {routeDetailTarget.stop_count || routeDetailTarget.stops.length} {t('assignments.stop')} • {Number(routeDetailTarget.total_distance_km || 0)} km • {formatDuration(routeDetailTarget.total_duration_min)}
                                    </p>
                                </div>
                                <button onClick={closeRouteDetailModal} className="text-gray-400 hover:text-gray-600 self-end lg:self-auto"><X size={20} /></button>
                            </div>

                            <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 overflow-y-auto">
                                <div className="space-y-3">
                                    {[...(routeDetailTarget.stops || [])]
                                        .sort((a, b) => a.stop_order - b.stop_order)
                                        .map(stop => (
                                            <div key={stop.id} className="grid grid-cols-[auto_1fr] gap-4 rounded-xl border border-gray-200 bg-white p-4">
                                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                                                    {stop.stop_order}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div>
                                                            <h4 className="font-semibold text-gray-900">{stop.delivery?.customer_name || t('assignments.customerFallback')}</h4>
                                                            <p className="text-xs text-gray-500">{stop.delivery?.customer_phone || t('assignments.noPhone')}</p>
                                                        </div>
                                                        <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 border border-gray-200">
                                                            {formatDeliveryStatus(stop.delivery?.status, stop.delivery?.status_display)}
                                                        </span>
                                                    </div>
                                                    <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                                        <MapPin size={14} className="inline mr-1 text-gray-400" />
                                                        {stop.delivery?.customer_address || t('assignments.noAddress')}
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                                                        <div className="rounded-lg bg-blue-50 px-3 py-2">
                                                            <div className="text-xs text-blue-600 font-semibold">{t('assignments.product')}</div>
                                                            <div className="font-medium text-gray-900 truncate">{stop.delivery?.product_name || t('assignments.product')}</div>
                                                        </div>
                                                        <div className="rounded-lg bg-gray-50 px-3 py-2">
                                                            <div className="text-xs text-gray-500 font-semibold">{t('assignments.quantity')}</div>
                                                            <div className="font-medium text-gray-900">{stop.delivery?.quantity || 1}</div>
                                                        </div>
                                                        <div className="rounded-lg bg-gray-50 px-3 py-2">
                                                            <div className="text-xs text-gray-500 font-semibold">{t('assignments.fromPreviousStop')}</div>
                                                            <div className="font-medium text-gray-900">{Number(stop.distance_from_previous_km || 0)} km • {stop.duration_from_previous_min || 0} {t('assignments.min')}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>

                                <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4 h-fit">
                                    <h4 className="font-semibold text-gray-900">{t('assignments.driverAssignment')}</h4>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {t('assignments.currentAssigned', { name: routeDetailTarget.driver_name || t('assignments.unassigned') })}
                                    </p>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mt-4 mb-1">{t('assignments.lblDriver')}</label>
                                    <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
                                        <option value="">{t('assignments.selectPlaceholder')}</option>
                                        {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} ({d.username})</option>)}
                                    </select>
                                    <button onClick={handleAssignRouteDriverFromDetail} disabled={submitting || !selectedDriverId}
                                        className="mt-3 w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : <UserCheck size={18} />}
                                        {t('assignments.btnAssign')}
                                    </button>
                                </aside>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Prepared Route Modal */}
                {routeDeleteModal && routeDeleteTarget && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
                            <div className="p-6 text-center">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">{t('assignments.deletePlanConfirmTitle')}</h3>
                                <p className="text-gray-500 text-sm mb-2">
                                    {formatDate(routeDeleteTarget.date)} tarihli, {routeDeleteTarget.stop_count || routeDeleteTarget.stops?.length || 0} duraklı plan silinecek.
                                </p>
                                <p className="text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm mb-6">
                                    Teslimatlar silinmez; rota kaldırılır ve teslimatlar tekrar bekleme durumuna alınır.
                                </p>
                                <div className="flex gap-3">
                                    <button onClick={() => { setRouteDeleteModal(false); setRouteDeleteTarget(null); }}
                                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">
                                        {t('assignments.btnCancel')}
                                    </button>
                                    <button onClick={handleDeletePreparedRoute} disabled={submitting}
                                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {submitting ? <Loader2 className="animate-spin" size={18} /> : t('assignments.btnDeletePlan')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== AUTO-PLAN PREVIEW MODAL ===== */}
                {autoPlanModal && autoPlanData && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                        <Route size={20} className="text-emerald-600" /> {t('assignments.autoPlanTitle')}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-0.5">{t('assignments.autoPlanSubtitle')}</p>
                                </div>
                                <button onClick={() => setAutoPlanModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>

                            {/* Summary bar */}
                            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">
                                    {t('assignments.autoPlanSummary', {
                                        days: autoPlanData.summary?.total_days || 0,
                                        count: autoPlanData.summary?.total_deliveries || 0,
                                        km: autoPlanData.summary?.total_distance_km || 0,
                                    })}
                                </span>
                                {autoPlanData.warnings?.no_coordinates?.length > 0 && (
                                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                                        ⚠ {t('assignments.autoPlanWarningNoCoord', { count: autoPlanData.warnings.no_coordinates.length })}
                                    </span>
                                )}
                            </div>

                            {/* Day-by-day plan */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-3">
                                {autoPlanData.days?.map((day: any, idx: number) => (
                                    <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden hover:border-emerald-300 transition-colors">
                                        {/* Day header — clickable */}
                                        <button onClick={() => setExpandedDay(expandedDay === idx ? null : idx)}
                                            className="w-full px-5 py-3.5 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors text-left">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900">{day.weekday}, {day.date}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {t('assignments.autoPlanDistricts', { districts: day.district_names?.join(', ') || '-' })}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm">
                                                <span className="text-gray-600 flex items-center gap-1">
                                                    <Package size={14} /> {day.delivery_count}
                                                </span>
                                                <span className="text-gray-600 flex items-center gap-1">
                                                    <MapPin size={14} /> {day.total_distance_km || 0} km
                                                </span>
                                                <span className={`flex items-center gap-1 ${(day.total_duration_min || 0) > 360 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                                    🕐 {day.total_duration_min || 0} {t('assignments.min')}
                                                </span>
                                                <span className="text-gray-400 text-lg">{expandedDay === idx ? '▲' : '▼'}</span>
                                            </div>
                                        </button>

                                        {/* Expanded stop list */}
                                        {expandedDay === idx && (
                                            <div className="border-t border-gray-100 bg-gray-50">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-gray-500 text-xs border-b border-gray-200">
                                                            <th className="px-5 py-2 text-left">#</th>
                                                            <th className="px-3 py-2 text-left">{t('assignments.colCustomer')}</th>
                                                            <th className="px-3 py-2 text-left">{t('assignments.autoPlanStopProducts')}</th>
                                                            <th className="px-3 py-2 text-left">{t('assignments.colAddress')}</th>
                                                            <th className="px-3 py-2 text-right">{t('assignments.autoPlanStopDist')}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {day.stops?.map((stop: any, si: number) => (
                                                            <tr key={si} className="border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                                                                <td className="px-5 py-2.5 font-medium text-emerald-600">{stop.stop_order || si + 1}</td>
                                                                <td className="px-3 py-2.5">
                                                                    <div className="font-medium text-gray-900">{stop.customer_name}</div>
                                                                    {stop.coord_source === 'district_fallback' && (
                                                                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                                                            📍 {t('assignments.autoPlanCoordFallback')}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2.5">
                                                                    <div className="space-y-0.5">
                                                                        {stop.products?.map((p: any, pi: number) => (
                                                                            <div key={pi} className="text-xs text-gray-600">
                                                                                {p.product_name} {p.quantity > 1 ? `(×${p.quantity})` : ''}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2.5 text-gray-500 text-xs">{stop.district_name}</td>
                                                                <td className="px-3 py-2.5 text-right text-gray-600">{stop.dist_from_prev} km</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
                                <button onClick={() => setAutoPlanModal(false)}
                                    className="flex-1 px-4 py-2.5 text-gray-700 bg-white hover:bg-gray-100 rounded-lg font-medium transition-colors border border-gray-200">
                                    {t('assignments.autoPlanCancel')}
                                </button>
                                <button onClick={handleApprovePlan} disabled={autoPlanApproving}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg font-medium transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2">
                                    {autoPlanApproving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                                    {autoPlanApproving ? t('assignments.autoPlanApproving') : t('assignments.autoPlanApprove')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
