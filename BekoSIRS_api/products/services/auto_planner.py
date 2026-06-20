"""
Auto-Planner Service
====================
District-based delivery planning with capacity constraints.

Algorithm:
1. Collect PLANNED assignments that have no Delivery record yet.
2. Resolve coordinates for each customer (fallback: District center).
3. Group same-customer assignments into a single logical stop.
4. Group stops by District (İlçe).
5. Distribute district groups across the next N business days,
   respecting a daily cap of MAX_DELIVERIES_PER_DAY.
6. For each day, run Nearest-Neighbor + 2-opt to optimize the route.
7. Return a preview JSON (nothing written to DB).
"""

import math
from datetime import date, timedelta
from collections import defaultdict
from typing import List, Dict, Any, Tuple, Optional

from ..models import (
    ProductAssignment, Delivery, CustomerAddress, DepotLocation, DeliveryRoute
)
from .routing_provider import RouteMatrix, get_route_matrix


# ── Config ──────────────────────────────────────────────────────────
# Kapasite artık zaman-bazlı: bir gün, toplam süre (sürüş + durak + kurulum)
# WORK_MINUTES_PER_DAY'i aşmadığı sürece dolar. MAX_DELIVERIES_PER_DAY yalnızca
# bir emniyet üst sınırıdır.
MAX_DELIVERIES_PER_DAY = 25      # güvenlik üst sınırı (asıl kısıt zamandır)
MAX_HOURS_PER_DAY = 6            # varsayılan günlük çalışma süresi (saat)
WORK_MINUTES_PER_DAY = MAX_HOURS_PER_DAY * 60  # = 360 dk
AVG_SPEED_KMH = 50               # KKTC ortalama yol hızı (tek kaynak)
BASE_HANDLING_MIN = 10           # her durakta indirme/teslim/imza için temel süre
STOP_DURATION_MIN = BASE_HANDLING_MIN  # geriye dönük uyumluluk (eski kullanımlar)
AVG_INTER_STOP_MIN = 12          # ön-dağıtım tahmini: duraklar arası ortalama sürüş (dk)
# ────────────────────────────────────────────────────────────────────


# ════════════════════════════════════════════════════════════════════
# 0. Kurulum süresi yardımcısı
# ════════════════════════════════════════════════════════════════════
def assignment_install_min(assignment) -> int:
    """Bir atamanın toplam kurulum süresi (dk) = kategori süresi × adet."""
    if not assignment:
        return 0
    product = getattr(assignment, 'product', None)
    cat = getattr(product, 'category', None) if product else None
    if cat and getattr(cat, 'requires_installation', False):
        return int(cat.install_duration_min or 0) * int(getattr(assignment, 'quantity', 1) or 1)
    return 0


def delivery_install_min(delivery) -> int:
    """Bir teslimatın (route stop) kurulum süresi (dk)."""
    if not delivery:
        return 0
    return assignment_install_min(getattr(delivery, 'assignment', None))


# ════════════════════════════════════════════════════════════════════
# 1. Haversine
# ════════════════════════════════════════════════════════════════════
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the distance (km) between two lat/lng points."""
    R = 6371
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ════════════════════════════════════════════════════════════════════
# 2. Nearest-Neighbor + 2-opt
# ════════════════════════════════════════════════════════════════════
def _matrix_distance(matrix: Optional[RouteMatrix], from_idx: int, to_idx: int) -> Optional[float]:
    if not matrix:
        return None
    try:
        return matrix.distances_km[from_idx][to_idx]
    except (IndexError, TypeError):
        return None


def _matrix_duration(matrix: Optional[RouteMatrix], from_idx: int, to_idx: int) -> Optional[float]:
    if not matrix:
        return None
    try:
        return matrix.durations_min[from_idx][to_idx]
    except (IndexError, TypeError):
        return None


def _leg_distance(
    depot: Tuple[float, float],
    from_stop: Optional[dict],
    to_stop: dict,
    matrix: Optional[RouteMatrix],
) -> float:
    from_idx = from_stop.get('_matrix_index') if from_stop else 0
    to_idx = to_stop.get('_matrix_index')
    matrix_distance = _matrix_distance(matrix, from_idx, to_idx)
    if matrix_distance is not None:
        return float(matrix_distance)

    from_lat, from_lng = (from_stop['lat'], from_stop['lng']) if from_stop else depot
    return haversine_km(float(from_lat), float(from_lng), float(to_stop['lat']), float(to_stop['lng']))


def _leg_duration_min(
    from_stop: Optional[dict],
    to_stop: dict,
    matrix: Optional[RouteMatrix],
    distance_km: float,
) -> float:
    from_idx = from_stop.get('_matrix_index') if from_stop else 0
    to_idx = to_stop.get('_matrix_index')
    matrix_duration = _matrix_duration(matrix, from_idx, to_idx)
    if matrix_duration is not None:
        return float(matrix_duration)
    return (distance_km / AVG_SPEED_KMH) * 60


def _recalculate_route_legs(
    route: List[dict],
    depot: Tuple[float, float],
    matrix: Optional[RouteMatrix],
) -> List[dict]:
    prev_stop = None
    for stop in route:
        distance = _leg_distance(depot, prev_stop, stop, matrix)
        drive_duration = _leg_duration_min(prev_stop, stop, matrix, distance)
        stop['dist_from_prev'] = round(distance, 2)
        stop['drive_duration_from_prev_min'] = round(drive_duration, 1)
        stop['duration_from_prev_min'] = int(drive_duration + STOP_DURATION_MIN)
        stop['routing_source'] = matrix.source if matrix else 'haversine'
        prev_stop = stop
    return route


def _leg_cost(
    depot: Tuple[float, float],
    from_stop: Optional[dict],
    to_stop: dict,
    matrix: Optional[RouteMatrix],
) -> float:
    """Süre-bazlı maliyet (dakika). OSRM varsa gerçek süre, yoksa mesafeden tahmin."""
    distance = _leg_distance(depot, from_stop, to_stop, matrix)
    return _leg_duration_min(from_stop, to_stop, matrix, distance)


def _nn_route(
    depot: Tuple[float, float],
    stops: List[dict],
    matrix: Optional[RouteMatrix] = None,
) -> List[dict]:
    """
    Nearest-Neighbor ordering — süre (dakika) bazlı.
    Each stop dict must have 'lat' and 'lng' keys.
    Returns the ordered list with 'dist_from_prev' added.
    """
    if not stops:
        return []

    unvisited = list(stops)
    route: List[dict] = []
    current_stop = None

    while unvisited:
        best, best_cost = None, float('inf')
        for s in unvisited:
            cost = _leg_cost(depot, current_stop, s, matrix)
            if cost < best_cost:
                best_cost = cost
                best = s
        unvisited.remove(best)
        route.append(best)
        current_stop = best

    return _recalculate_route_legs(route, depot, matrix)


def _two_opt(
    route: List[dict],
    depot: Tuple[float, float],
    matrix: Optional[RouteMatrix] = None,
) -> List[dict]:
    """Improve route with 2-opt swaps (süre bazlı) until no improvement is found."""
    if len(route) < 3:
        return route

    def total_time(r: List[dict]) -> float:
        cost = _leg_cost(depot, None, r[0], matrix)
        for idx in range(len(r) - 1):
            cost += _leg_cost(depot, r[idx], r[idx + 1], matrix)
        return cost

    improved = True
    while improved:
        improved = False
        best_time = total_time(route)
        for i in range(len(route) - 1):
            for j in range(i + 1, len(route)):
                new_route = route[:i] + list(reversed(route[i:j + 1])) + route[j + 1:]
                new_time = total_time(new_route)
                if new_time < best_time - 0.1:  # 6 saniye tolerans
                    route = new_route
                    best_time = new_time
                    improved = True
                    break
            if improved:
                break

    return _recalculate_route_legs(route, depot, matrix)


def optimize_route(depot: Tuple[float, float], stops: List[dict]) -> List[dict]:
    """NN followed by 2-opt, using road matrix when the routing API is available."""
    indexed_stops = [{**stop, '_matrix_index': idx + 1} for idx, stop in enumerate(stops)]
    matrix = get_route_matrix([depot] + [(float(stop['lat']), float(stop['lng'])) for stop in indexed_stops])
    route = _nn_route(depot, indexed_stops, matrix)
    optimized = _two_opt(route, depot, matrix)
    for stop in optimized:
        stop.pop('_matrix_index', None)
    return optimized


# ════════════════════════════════════════════════════════════════════
# 3. Business-day helpers
# ════════════════════════════════════════════════════════════════════
def next_business_days(start: date, count: int) -> List[date]:
    """Return the next `count` weekdays starting from the day after `start`."""
    days: List[date] = []
    current = start
    while len(days) < count:
        current += timedelta(days=1)
        if current.weekday() < 5:  # Mon=0 … Fri=4
            days.append(current)
    return days


def next_delivery_days(start: date, count: int, allowed_weekdays: Optional[List[int]] = None) -> List[date]:
    """Return the next delivery dates based on seller-selected weekdays."""
    if not allowed_weekdays:
        allowed_weekdays = [0, 1, 2, 3, 4]

    allowed = {int(day) for day in allowed_weekdays if 0 <= int(day) <= 6}
    if not allowed:
        allowed = {0, 1, 2, 3, 4}

    days: List[date] = []
    current = start
    while len(days) < count:
        current += timedelta(days=1)
        if current.weekday() in allowed:
            days.append(current)
    return days


# ════════════════════════════════════════════════════════════════════
# 4. Coordinate resolver
# ════════════════════════════════════════════════════════════════════
def _resolve_customer_coords(customer) -> Tuple[Optional[float], Optional[float], str]:
    """
    Returns (lat, lng, source) where source is 'exact' | 'district_fallback' | None.
    """
    try:
        addr = customer.customer_address
        if addr.latitude and addr.longitude:
            return float(addr.latitude), float(addr.longitude), 'exact'
        # Fallback: district center
        if addr.district and addr.district.center_lat and addr.district.center_lng:
            return float(addr.district.center_lat), float(addr.district.center_lng), 'district_fallback'
    except CustomerAddress.DoesNotExist:
        pass
    return None, None, 'missing'


def _find_existing_active_delivery(customer_id: int, start_date: date) -> Optional[Delivery]:
    """Return the earliest open delivery for this customer, if one is already planned."""
    return Delivery.objects.filter(
        assignment__customer_id=customer_id,
        scheduled_date__gte=start_date,
        status__in=['WAITING', 'OUT_FOR_DELIVERY'],
    ).select_related(
        'assignment__customer',
        'route_stop__route',
    ).order_by('scheduled_date', 'id').first()


# ════════════════════════════════════════════════════════════════════
# 5. Main pipeline — yardımcı fonksiyonlar
# ════════════════════════════════════════════════════════════════════
WEEKDAY_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']


def _make_day_entry(d: date) -> dict:
    return {
        'date': d.isoformat(),
        'weekday': WEEKDAY_TR[d.weekday()],
        'district_names': [],
        'stops': [],
        'delivery_count': 0,
        '_budget_used': 0.0,  # ön-dağıtım tahmini; döndürülmeden önce silinir
    }


def _add_stop_to_day(day: dict, stop: dict) -> None:
    day['stops'].append(stop)
    day['delivery_count'] += len(stop['assignment_ids'])
    day['_budget_used'] = day.get('_budget_used', 0.0) + stop['service_min'] + AVG_INTER_STOP_MIN
    if stop['district_name'] not in day['district_names']:
        day['district_names'].append(stop['district_name'])


def _day_is_full(day: dict, work_minutes: float) -> bool:
    """En küçük olası durak bile sığmıyorsa gün dolu sayılır."""
    min_cost = BASE_HANDLING_MIN + AVG_INTER_STOP_MIN
    return (
        day.get('_budget_used', 0.0) + min_cost > work_minutes
        or day['delivery_count'] >= MAX_DELIVERIES_PER_DAY
    )


def _day_has_capacity(day: dict, stop: dict, work_minutes: float) -> bool:
    cost = stop['service_min'] + AVG_INTER_STOP_MIN
    new_budget = day.get('_budget_used', 0.0) + cost
    new_count = day['delivery_count'] + len(stop['assignment_ids'])
    return new_budget <= work_minutes and new_count <= MAX_DELIVERIES_PER_DAY


def _append_day(day_plan: list, business_days: list, allowed_weekdays: list) -> int:
    extra = next_delivery_days(business_days[-1], 1, allowed_weekdays)
    business_days.extend(extra)
    day_plan.append(_make_day_entry(extra[0]))
    return len(day_plan) - 1


# ════════════════════════════════════════════════════════════════════
# 6. Main pipeline
# ════════════════════════════════════════════════════════════════════
def generate_auto_plan(
    start_date: Optional[date] = None,
    *,
    allowed_weekdays: Optional[List[int]] = None,
    max_hours_per_day: Optional[float] = None,
    depot_id: Optional[int] = None,
    assignment_ids: Optional[List[int]] = None,
    locked: Optional[Dict[str, List[int]]] = None,
) -> Dict[str, Any]:
    """
    Build a multi-day delivery plan preview without writing to DB.

    Kapasite ZAMAN-bazlıdır: bir gün, toplam süre
    (sürüş + temel handling + kurulum) work_minutes'ı (varsayılan 360 dk)
    aşana kadar dolar. MAX_DELIVERIES_PER_DAY yalnızca emniyet üst sınırıdır.

    locked parametresi — kullanıcının sürükle-bırak ile kilitlediği duraklar:
        { "2026-06-16": [assignment_id, ...], "2026-06-17": [...] }
    Kilitlenen duraklar o günde sabit tutulur; gerisini algoritma dağıtır.

    Her durak; 'service_min' (handling + kurulum), 'install_total_min',
    'requires_installation' ve ürün bazında kurulum detayları içerir.

    Returns:
    {
        "days": [
            {
                "date": "2026-05-07",
                "weekday": "Pazartesi",
                "district_names": ["Lefkoşa"],
                "total_distance_km": 42.3,
                "total_drive_min": 55,
                "total_service_min": 80,
                "total_duration_min": 135,
                "work_budget_min": 360,
                "delivery_count": 4,
                "stops": [ { stop detail } ]
            },
            ...
        ],
        "summary": { "total_deliveries": 12, "total_days": 3, ... },
        "warnings": { "no_coordinates": [...], "over_time_days": [...] }
    }
    """
    if start_date is None:
        start_date = date.today()
    work_minutes = float(max_hours_per_day * 60) if max_hours_per_day else float(WORK_MINUTES_PER_DAY)
    allowed_wd = sorted({int(d) for d in (allowed_weekdays or [0, 1, 2, 3, 4]) if 0 <= int(d) <= 6}) or [0, 1, 2, 3, 4]

    # ── Step 1: Bekleyen atamaları topla ──
    pending = ProductAssignment.objects.filter(
        status__in=['PLANNED', 'PENDING']
    ).exclude(
        delivery__isnull=False
    ).select_related(
        'customer', 'customer__customer_address',
        'customer__customer_address__district',
        'product', 'product__category',
    ).order_by('assigned_at')

    if assignment_ids:
        pending = pending.filter(id__in=assignment_ids)

    if not pending.exists():
        return {
            'days': [],
            'summary': {'total_deliveries': 0, 'total_days': 0},
            'warnings': {},
        }

    # ── Step 2: Koordinat çöz, servis süresi hesapla, mantıksal durakları oluştur ──
    customer_stops: Dict[int, dict] = {}
    split_stops: List[dict] = []   # adedi günlere bölünen büyük siparişlerin parçaları
    no_coords: List[int] = []
    skipped_customers: set = set()
    coords_cache: Dict[int, tuple] = {}

    def _resolve_cached(cust):
        cid = cust.id
        if cid in coords_cache:
            return coords_cache[cid]
        lat, lng, source = _resolve_customer_coords(cust)
        district_name = 'Bilinmiyor'
        if lat is not None:
            try:
                district_name = cust.customer_address.district.name if cust.customer_address.district else 'Bilinmiyor'
            except Exception:
                pass
        coords_cache[cid] = (lat, lng, source, district_name)
        return coords_cache[cid]

    for assignment in pending:
        cust = assignment.customer
        cid = cust.id

        if cid in skipped_customers:
            no_coords.append(assignment.id)
            continue

        lat, lng, source, district_name = _resolve_cached(cust)
        if lat is None:
            no_coords.append(assignment.id)
            skipped_customers.add(cid)
            continue

        cat = assignment.product.category
        install_min_per_unit = (cat.install_duration_min if cat and cat.requires_installation else 0)
        qty = assignment.quantity
        install_for_this = install_min_per_unit * qty

        # ── Tek siparişin kurulumu bir günlük bütçeyi aşıyorsa adedi parçalara böl ──
        # (örn. 26 buzdolabı = 520 dk > 360 dk → 16 adet bir gün + 10 adet ertesi gün)
        if install_min_per_unit > 0 and (install_for_this + BASE_HANDLING_MIN) > work_minutes:
            # Bir güne sığacak azami adet (handling + duraklar arası sürüş payı düşülür)
            usable = work_minutes - BASE_HANDLING_MIN - AVG_INTER_STOP_MIN
            max_units = max(1, int(usable // install_min_per_unit))
            total_parts = math.ceil(qty / max_units)
            remaining = qty
            part = 0
            while remaining > 0:
                part += 1
                chunk_qty = min(max_units, remaining)
                remaining -= chunk_qty
                chunk_install = chunk_qty * install_min_per_unit
                split_stops.append({
                    'customer_id': cid,
                    'customer_name': f"{cust.first_name} {cust.last_name}".strip() or cust.username,
                    'lat': lat,
                    'lng': lng,
                    'coord_source': source,
                    'district_name': district_name,
                    'preferred_date': None,
                    'locked': False,
                    'existing_route_id': None,
                    'assignment_ids': [assignment.id],
                    'products': [{
                        'assignment_id': assignment.id,
                        'product_id': assignment.product.id,
                        'product_name': assignment.product.name,
                        'quantity': chunk_qty,
                        'requires_installation': True,
                        'install_duration_min': install_min_per_unit,
                        'install_total_min': chunk_install,
                        'is_split_chunk': True,
                        'split_index': part,
                        'split_total': total_parts,
                    }],
                    'total_quantity': chunk_qty,
                    'service_min': BASE_HANDLING_MIN + chunk_install,
                    'install_total_min': chunk_install,
                    'requires_installation': True,
                    'is_split_chunk': True,
                    'split_index': part,
                    'split_total': total_parts,
                })
            continue

        # ── Normal akış: müşterinin tek durağına ekle ──
        if cid not in customer_stops:
            customer_stops[cid] = {
                'customer_id': cid,
                'customer_name': f"{cust.first_name} {cust.last_name}".strip() or cust.username,
                'lat': lat,
                'lng': lng,
                'coord_source': source,
                'district_name': district_name,
                'preferred_date': None,
                'locked': False,
                'existing_route_id': None,
                'assignment_ids': [],
                'products': [],
                'total_quantity': 0,
                # Servis süresi: her durak için temel handling + kurulum toplamı
                'service_min': BASE_HANDLING_MIN,
                'install_total_min': 0,
                'requires_installation': False,
            }
            existing = _find_existing_active_delivery(cid, start_date)
            if existing:
                customer_stops[cid]['preferred_date'] = existing.scheduled_date.isoformat()
                customer_stops[cid]['locked'] = True
                try:
                    customer_stops[cid]['existing_route_id'] = existing.route_stop.route_id
                except Exception:
                    pass

        stop = customer_stops[cid]
        stop['assignment_ids'].append(assignment.id)
        stop['products'].append({
            'assignment_id': assignment.id,
            'product_id': assignment.product.id,
            'product_name': assignment.product.name,
            'quantity': qty,
            'requires_installation': bool(cat and cat.requires_installation),
            'install_duration_min': install_min_per_unit,
            'install_total_min': install_for_this,
        })
        stop['total_quantity'] += qty
        stop['install_total_min'] += install_for_this
        stop['service_min'] = BASE_HANDLING_MIN + stop['install_total_min']
        if install_for_this > 0:
            stop['requires_installation'] = True

    # ── Step 2b: Kullanıcı kilitlerini uygula ──
    # locked = {"2026-06-16": [aid, ...], ...}
    # Bir durağın herhangi bir ataması kilitliyse tüm durak o güne sabitlenir.
    if locked:
        aid_to_date: Dict[int, str] = {
            aid: date_str
            for date_str, aids in locked.items()
            for aid in aids
        }
        for stop in customer_stops.values():
            if stop['preferred_date']:
                continue  # zaten sabitlenmiş (mevcut aktif teslimat)
            for aid in stop['assignment_ids']:
                if aid in aid_to_date:
                    stop['preferred_date'] = aid_to_date[aid]
                    stop['locked'] = True
                    break

    stops_list = list(customer_stops.values()) + split_stops

    if not stops_list:
        return {
            'days': [],
            'summary': {'total_deliveries': 0, 'total_days': 0},
            'warnings': {'no_coordinates': no_coords},
        }

    # ── Step 3: İlçeye göre grupla ──
    anchored_stops = [s for s in stops_list if s.get('preferred_date')]
    unanchored_stops = [s for s in stops_list if not s.get('preferred_date')]

    district_groups: Dict[str, List[dict]] = defaultdict(list)
    for stop in unanchored_stops:
        district_groups[stop['district_name']].append(stop)

    # İlçeleri toplam servis sürelerine göre büyükten küçüğe sırala
    sorted_districts = sorted(
        district_groups.items(),
        key=lambda x: -sum(s['service_min'] for s in x[1]),
    )

    # ── Step 4: Zaman-bazlı gün dağıtımı ──
    total_estimated = sum(s['service_min'] + AVG_INTER_STOP_MIN for _, stops in sorted_districts for s in stops)
    num_days = max(1, math.ceil(total_estimated / work_minutes))
    allowed_set = set(allowed_wd)

    # Mevcut açık rotaları yükle — kapasitesi olan günlere yeni atamaları önce ekle.
    # date__gte: start_date dahil (aynı günde açık rota varsa değerlendir).
    prefill_budgets: Dict[str, float] = {}
    for _fr in DeliveryRoute.objects.filter(
        date__gte=start_date,
        status__in=['PLANNED', 'WAITING'],
    ).order_by('date').values('date', 'total_duration_min'):
        _d = _fr['date']
        if _d.weekday() not in allowed_set:
            continue
        _ds = _d.isoformat()
        prefill_budgets[_ds] = prefill_budgets.get(_ds, 0.0) + float(_fr.get('total_duration_min') or 0)

    day_plan: List[Dict[str, Any]] = []
    day_by_date: Dict[str, dict] = {}

    for _ds in sorted(prefill_budgets):
        _day = _make_day_entry(date.fromisoformat(_ds))
        _day['_budget_used'] = prefill_budgets[_ds]
        _day['has_existing_route'] = True
        day_plan.append(_day)
        day_by_date[_ds] = _day

    # Mevcut günlerin kalan kapasitesinden fazlası için yeni gün üret
    existing_cap = sum(max(0.0, work_minutes - prefill_budgets[ds]) for ds in prefill_budgets)
    extra_needed = max(0.0, total_estimated - existing_cap)
    fresh_count = max(0, math.ceil(extra_needed / work_minutes)) if prefill_budgets else num_days

    _fresh_added = 0
    for _d in next_delivery_days(start_date, fresh_count + len(prefill_budgets) + num_days, allowed_wd):
        if _fresh_added >= fresh_count:
            break
        _ds = _d.isoformat()
        if _ds not in day_by_date:
            _day = _make_day_entry(_d)
            day_plan.append(_day)
            day_by_date[_ds] = _day
            _fresh_added += 1

    # Hiç gün oluşmadıysa (edge case) varsayılan güne dön
    if not day_plan:
        for _d in next_delivery_days(start_date, num_days, allowed_wd):
            _ds = _d.isoformat()
            _day = _make_day_entry(_d)
            day_plan.append(_day)
            day_by_date[_ds] = _day

    # Kronolojik sırala (prefill + fresh karışık olabilir)
    day_plan.sort(key=lambda d: d['date'])
    business_days: List[date] = [date.fromisoformat(d['date']) for d in day_plan]

    # Sabitlenmiş (mevcut aktif teslimatı olan) durakları önce yerleştir
    for stop in anchored_stops:
        pdate = stop['preferred_date']
        if pdate not in day_by_date:
            new_day = _make_day_entry(date.fromisoformat(pdate))
            new_day['has_existing_route'] = True
            day_by_date[pdate] = new_day
            day_plan.append(new_day)
        target = day_by_date[pdate]
        _add_stop_to_day(target, stop)
        target['has_existing_route'] = bool(stop.get('existing_route_id')) or target.get('has_existing_route', False)

    # Serbest durakları ilçe ilçe dağıt
    day_idx = 0
    for _district_name, stops in sorted_districts:
        remaining = list(stops)
        while remaining:
            if day_idx >= len(day_plan):
                day_idx = _append_day(day_plan, business_days, allowed_wd)

            # Dolu günleri atla
            while day_idx < len(day_plan) and _day_is_full(day_plan[day_idx], work_minutes):
                day_idx += 1
            if day_idx >= len(day_plan):
                day_idx = _append_day(day_plan, business_days, allowed_wd)

            day = day_plan[day_idx]
            new_remaining = []
            added_any = False
            for s in remaining:
                if _day_has_capacity(day, s, work_minutes):
                    _add_stop_to_day(day, s)
                    added_any = True
                else:
                    new_remaining.append(s)
            remaining = new_remaining

            if not added_any and remaining:
                # Hiçbiri sığmadı. Yalnızca GERÇEKTEN boş güne (mevcut rotası ve
                # ön-yüklenmiş bütçesi olmayan) zorla ekle — tek bir devasa durak
                # bütçeyi aşsa bile bir yere konmalı (uyarı verilecek).
                # Prefill günleri (mevcut rotalı, _budget_used > 0) zorla hedef OLMAZ.
                if day['delivery_count'] == 0 and day.get('_budget_used', 0.0) <= 0.0:
                    _add_stop_to_day(day, remaining.pop(0))
                day_idx += 1

            elif remaining:
                day_idx += 1

    # ── Step 5: Her gün için rota optimize et, bütçe aşımında son durağı ertele ──
    depot_lat, depot_lng = 35.1856, 33.3823  # Lefkoşa varsayılan
    default_depot = DepotLocation.objects.filter(id=depot_id).first() if depot_id else None
    if not default_depot:
        default_depot = DepotLocation.objects.filter(is_default=True).first()
    if default_depot:
        depot_lat = float(default_depot.latitude)
        depot_lng = float(default_depot.longitude)

    over_time_days = []
    # Bir sonraki günün başına eklenecek taşma durakları
    spillover: Dict[int, List[dict]] = defaultdict(list)

    for di, day in enumerate(day_plan):
        # Önceki günden taşan durakları ekle
        for sp in spillover.pop(di, []):
            _add_stop_to_day(day, sp)

        if not day['stops']:
            continue

        optimized = optimize_route((depot_lat, depot_lng), day['stops'])
        day['stops'] = optimized

        # Gerçek toplam: sürüş + servis (handling + kurulum) + depoya dönüş tahmini
        total_drive = sum(s['drive_duration_from_prev_min'] for s in optimized)
        total_service = sum(s['service_min'] for s in optimized)
        # Son duraktan depoya dönüş süresini dahil et
        if optimized:
            _last = optimized[-1]
            _ret_dist = haversine_km(float(_last['lat']), float(_last['lng']), depot_lat, depot_lng)
            total_drive += (_ret_dist / AVG_SPEED_KMH) * 60
        actual_total = total_drive + total_service

        # Bütçeyi aşıyorsa kilitsiz son durakları bir sonraki güne taşı
        while actual_total > work_minutes and len(optimized) > 1:
            last = optimized[-1]
            if last.get('locked'):
                break
            optimized.pop()
            day['delivery_count'] -= len(last['assignment_ids'])
            for k in ('dist_from_prev', 'drive_duration_from_prev_min',
                      'duration_from_prev_min', 'routing_source', 'stop_order'):
                last.pop(k, None)
            spillover[di + 1].append(last)
            # Toplam süreyi yeniden hesapla (yeni son duraktan depoya dönüş dahil)
            total_drive = sum(s['drive_duration_from_prev_min'] for s in optimized)
            total_service = sum(s['service_min'] for s in optimized)
            if optimized:
                _last = optimized[-1]
                _ret_dist = haversine_km(float(_last['lat']), float(_last['lng']), depot_lat, depot_lng)
                total_drive += (_ret_dist / AVG_SPEED_KMH) * 60
            actual_total = total_drive + total_service

        # Taşma için gün yoksa oluştur
        if spillover.get(di + 1) and di + 1 >= len(day_plan):
            _append_day(day_plan, business_days, allowed_wd)

        day['stops'] = optimized
        total_dist = sum(s['dist_from_prev'] for s in optimized)
        total_drive = sum(s['drive_duration_from_prev_min'] for s in optimized)
        total_service = sum(s['service_min'] for s in optimized)

        # Depoya dönüş bacağı: son duraktan depoya mesafe ve süre
        if optimized:
            last = optimized[-1]
            return_dist = _leg_distance(
                (depot_lat, depot_lng), last,
                {'lat': depot_lat, 'lng': depot_lng, '_matrix_index': 0}, None
            )
            return_drive = (return_dist / AVG_SPEED_KMH) * 60
            total_dist += return_dist
            total_drive += return_drive

        actual_total = total_drive + total_service

        day['total_distance_km'] = round(total_dist, 2)
        day['total_drive_min'] = round(total_drive, 1)
        day['total_service_min'] = round(total_service, 1)
        day['total_duration_min'] = round(actual_total, 1)
        day['return_to_depot_km'] = round(return_dist, 2) if optimized else 0
        day['work_budget_min'] = int(work_minutes)

        if actual_total > work_minutes:
            over_time_days.append(day['date'])

        for idx, stop in enumerate(optimized, 1):
            stop['stop_order'] = idx

    # ── Step 6: Boş günleri ve dahili alanları temizle ──
    day_plan = [d for d in day_plan if d['stops']]
    for day in day_plan:
        day.pop('_budget_used', None)

    warnings: Dict[str, Any] = {}
    if no_coords:
        warnings['no_coordinates'] = no_coords
    if over_time_days:
        warnings['over_time_days'] = over_time_days

    return {
        'days': day_plan,
        'summary': {
            'total_deliveries': sum(d['delivery_count'] for d in day_plan),
            'total_days': len(day_plan),
            'total_distance_km': round(sum(d.get('total_distance_km', 0) for d in day_plan), 2),
            'total_duration_min': round(sum(d.get('total_duration_min', 0) for d in day_plan), 1),
            'work_budget_min': int(work_minutes),
            'allowed_weekdays': allowed_wd,
            'depot_id': default_depot.id if default_depot else None,
            'depot_name': default_depot.name if default_depot else "Beko Mağaza, Lefkoşa",
        },
        'warnings': warnings,
    }


# ════════════════════════════════════════════════════════════════════
# 6. Plan approval — writes to DB
# ════════════════════════════════════════════════════════════════════
def recalculate_route_metrics(route) -> None:
    """Recalculate per-stop distances and route totals from stored coordinates."""
    from django.utils import timezone

    depot_lat = float(route.store_lat or 35.1856)
    depot_lng = float(route.store_lng or 33.3823)
    prev_lat, prev_lng = depot_lat, depot_lng
    prev_matrix_idx = 0
    total_distance = 0.0
    stop_count = 0

    stops = list(route.stops.select_related(
        'delivery',
        'delivery__assignment',
        'delivery__assignment__product',
        'delivery__assignment__product__category',
    ).order_by('stop_order', 'id'))
    matrix = None
    if all(stop.delivery and stop.delivery.address_lat is not None and stop.delivery.address_lng is not None for stop in stops):
        matrix = get_route_matrix(
            [(depot_lat, depot_lng)]
            + [(float(stop.delivery.address_lat), float(stop.delivery.address_lng)) for stop in stops]
        )

    for idx, stop in enumerate(stops, 1):
        stop_count += 1
        delivery = stop.delivery
        # Bu durağın kurulum süresi (kategori süresi × adet) — toplam süreye dahil
        install_min = delivery_install_min(delivery)
        if delivery.address_lat is None or delivery.address_lng is None:
            distance = float(stop.distance_from_previous_km or 0)
            duration = int((distance / AVG_SPEED_KMH) * 60) + STOP_DURATION_MIN + install_min
        else:
            cur_lat = float(delivery.address_lat)
            cur_lng = float(delivery.address_lng)
            matrix_distance = _matrix_distance(matrix, prev_matrix_idx, idx)
            matrix_duration = _matrix_duration(matrix, prev_matrix_idx, idx)
            distance = float(matrix_distance) if matrix_distance is not None else haversine_km(prev_lat, prev_lng, cur_lat, cur_lng)
            duration = int(matrix_duration if matrix_duration is not None else (distance / AVG_SPEED_KMH) * 60) + STOP_DURATION_MIN + install_min
            prev_lat, prev_lng = cur_lat, cur_lng
            prev_matrix_idx = idx

        stop.distance_from_previous_km = round(distance, 2)
        stop.duration_from_previous_min = duration
        stop.save(update_fields=['distance_from_previous_km', 'duration_from_previous_min'])
        total_distance += distance

    # Depoya dönüş bacağı
    return_distance = haversine_km(prev_lat, prev_lng, depot_lat, depot_lng) if stops else 0.0
    return_duration = (return_distance / AVG_SPEED_KMH) * 60

    route.total_distance_km = round(total_distance + return_distance, 2)
    route.total_duration_min = sum(stop.duration_from_previous_min or 0 for stop in stops) + int(return_duration)
    route.is_optimized = True
    route.optimized_at = timezone.now()
    route.save(update_fields=['total_distance_km', 'total_duration_min', 'is_optimized', 'optimized_at'])


def optimize_persisted_route(route) -> None:
    """
    Reorder an already saved route by customer-level stops.

    A customer can have multiple product deliveries on the same route. They must
    stay consecutive because physically this is one address visit.
    """
    stops = list(route.stops.select_related(
        'delivery',
        'delivery__assignment',
        'delivery__assignment__customer',
    ).order_by('stop_order', 'id'))

    if not stops:
        recalculate_route_metrics(route)
        return

    depot = (float(route.store_lat or 35.1856), float(route.store_lng or 33.3823))
    grouped = {}
    for route_stop in stops:
        delivery = route_stop.delivery
        assignment = delivery.assignment if delivery else None
        customer_id = assignment.customer_id if assignment else None
        key = ('customer', customer_id) if customer_id else ('stop', route_stop.id)

        lat = float(delivery.address_lat) if delivery and delivery.address_lat is not None else depot[0]
        lng = float(delivery.address_lng) if delivery and delivery.address_lng is not None else depot[1]

        if key not in grouped:
            grouped[key] = {
                'key': key,
                'lat': lat,
                'lng': lng,
                'stops': [],
            }
        grouped[key]['stops'].append(route_stop)

    optimized_groups = optimize_route(depot, list(grouped.values()))

    # Avoid unique_together(route, stop_order) conflicts while re-numbering.
    temp_offset = 100000
    for idx, route_stop in enumerate(stops, 1):
        route_stop.stop_order = temp_offset + idx
        route_stop.save(update_fields=['stop_order'])

    order = 0
    for group in optimized_groups:
        for route_stop in sorted(group['stops'], key=lambda item: (item.stop_order, item.id)):
            order += 1
            route_stop.stop_order = order
            route_stop.save(update_fields=['stop_order'])
            if route_stop.delivery:
                route_stop.delivery.delivery_order = order
                route_stop.delivery.save(update_fields=['delivery_order'])

    recalculate_route_metrics(route)


def approve_plan(plan_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Takes the preview plan and creates Delivery + DeliveryRoute + DeliveryRouteStop records.
    Returns a summary of what was created.
    """
    from django.utils import timezone
    from django.db.models import Max
    from ..models import Delivery, DeliveryRoute, DeliveryRouteStop

    depot_lat, depot_lng = 35.1856, 33.3823
    store_address = "Beko Mağaza, Lefkoşa"
    depot_id = plan_data.get('depot_id')
    default_depot = DepotLocation.objects.filter(id=depot_id).first() if depot_id else None
    if not default_depot:
        default_depot = DepotLocation.objects.filter(is_default=True).first()
    if default_depot:
        depot_lat = float(default_depot.latitude)
        depot_lng = float(default_depot.longitude)
        store_address = default_depot.name

    # ── Ön-işleme: adedi günlere bölünen siparişleri (split chunk) gerçek
    #    ProductAssignment kayıtlarına dönüştür. Delivery↔assignment OneToOne
    #    olduğu için her parça kendi atamasına sahip olmalı: ilk parça orijinal
    #    kaydı kullanır (adedi düşürülür), sonraki parçalar yeni alt-kayıt olur. ──
    split_seen: Dict[int, bool] = {}
    for day in plan_data.get('days', []):
        for stop in day.get('stops', []):
            new_aids = []
            for pi in stop.get('products', []):
                if not pi.get('is_split_chunk'):
                    new_aids.append(pi['assignment_id'])
                    continue
                orig_aid = pi['assignment_id']
                try:
                    orig = ProductAssignment.objects.get(id=orig_aid)
                except ProductAssignment.DoesNotExist:
                    new_aids.append(orig_aid)
                    continue
                if orig_aid not in split_seen:
                    # İlk parça: orijinal kaydın adedini bu parçaya indir
                    orig.quantity = pi['quantity']
                    orig.status = 'PLANNED'
                    orig.save(update_fields=['quantity', 'status'])
                    split_seen[orig_aid] = True
                    new_aids.append(orig_aid)
                else:
                    # Sonraki parçalar: yeni alt-kayıt oluştur
                    child = ProductAssignment.objects.create(
                        customer=orig.customer,
                        product=orig.product,
                        quantity=pi['quantity'],
                        status='PLANNED',
                        assigned_by=orig.assigned_by,
                        notes=(f"[{pi.get('split_index')}/{pi.get('split_total')} parti — "
                               f"adet günlere bölündü] " + (orig.notes or '')).strip(),
                    )
                    pi['assignment_id'] = child.id
                    new_aids.append(child.id)
            if any(p.get('is_split_chunk') for p in stop.get('products', [])):
                # Bu durağın assignment_ids listesini güncel (bölünmüş) id'lerle değiştir
                stop['assignment_ids'] = new_aids

    created_routes = []

    for day in plan_data.get('days', []):
        day_date = day['date']

        # Verify assignments are still PLANNED
        all_assignment_ids = []
        for stop in day.get('stops', []):
            all_assignment_ids.extend(stop.get('assignment_ids', []))

        if not all_assignment_ids:
            continue

        valid_assignments = ProductAssignment.objects.filter(
            id__in=all_assignment_ids,
            status__in=['PLANNED', 'PENDING'],
        ).exclude(
            delivery__isnull=False
        )

        valid_ids = set(valid_assignments.values_list('id', flat=True))
        if not valid_ids:
            continue

        existing_route_id = next((s.get('existing_route_id') for s in day.get('stops', []) if s.get('existing_route_id')), None)
        route = DeliveryRoute.objects.filter(id=existing_route_id).first() if existing_route_id else None
        if not route:
            route = DeliveryRoute.objects.filter(date=day_date, status__in=['PLANNED', 'WAITING']).order_by('id').first()

        route_created = False
        if not route:
            route = DeliveryRoute.objects.create(
                date=day_date,
                store_address=store_address,
                store_lat=depot_lat,
                store_lng=depot_lng,
                total_distance_km=day.get('total_distance_km', 0),
                total_duration_min=day.get('total_duration_min', 0),
                is_optimized=True,
                optimized_at=timezone.now(),
                status='PLANNED',
            )
            route_created = True
        else:
            route.total_distance_km = max(float(route.total_distance_km or 0), float(day.get('total_distance_km', 0) or 0))
            route.total_duration_min = max(int(route.total_duration_min or 0), int(day.get('total_duration_min', 0) or 0))
            route.is_optimized = True
            route.optimized_at = timezone.now()
            route.save(update_fields=['total_distance_km', 'total_duration_min', 'is_optimized', 'optimized_at'])

        stop_order = route.stops.aggregate(Max('stop_order'))['stop_order__max'] or 0
        for stop in day.get('stops', []):
            for product_info in stop.get('products', []):
                aid = product_info['assignment_id']
                if aid not in valid_ids:
                    continue

                stop_order += 1
                assignment = ProductAssignment.objects.get(id=aid)

                # Create Delivery with snapshot data
                delivery = Delivery.objects.create(
                    assignment=assignment,
                    scheduled_date=day_date,
                    address_lat=stop.get('lat'),
                    address_lng=stop.get('lng'),
                    status='WAITING',
                    delivery_order=stop_order,
                    depot=default_depot,
                )

                # Snapshot customer info
                try:
                    addr = assignment.customer.customer_address
                    parts = []
                    if addr.open_address:
                        parts.append(addr.open_address)
                    if addr.area:
                        parts.append(addr.area.name)
                    if addr.district:
                        parts.append(addr.district.name)
                    delivery.address = ", ".join(parts) if parts else ""
                    delivery.address_snapshot = delivery.address
                except Exception:
                    pass
                delivery.customer_phone_snapshot = assignment.customer.phone_number or ""
                delivery.save()

                # Create route stop
                DeliveryRouteStop.objects.create(
                    route=route,
                    delivery=delivery,
                    stop_order=stop_order,
                    distance_from_previous_km=stop.get('dist_from_prev', 0),
                    duration_from_previous_min=stop.get('duration_from_prev_min') or int((stop.get('dist_from_prev', 0) / AVG_SPEED_KMH) * 60) + STOP_DURATION_MIN,
                )

                # Update assignment status
                assignment.status = 'SCHEDULED'
                assignment.save(update_fields=['status'])

        optimize_persisted_route(route)

        created_routes.append({
            'route_id': route.id,
            'date': day_date,
            'stop_count': route.stops.count(),
            'merged_into_existing': not route_created,
        })

    return {
        'created_routes': created_routes,
        'total_routes': len(created_routes),
    }
