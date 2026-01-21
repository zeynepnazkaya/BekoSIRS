from rest_framework import viewsets, views, response, permissions, status
from rest_framework.decorators import action
from datetime import timedelta, date
from django.db.models import Sum, Count, F, Q, Avg
from django.utils import timezone
import traceback
import sys
from products.models import (
    Product, ProductOwnership, ServiceRequest, CustomUser, Category, 
    AuditLog, ProductAssignment, InstallmentPlan, Delivery
)
from products.serializers import AuditLogSerializer

# ... other views ...

class ChartsView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        today = timezone.now().date()
        
        # 1. Summary Cards
        # Calculate from ProductAssignment (Cash/Regular Sales)
        assignments_today = ProductAssignment.objects.filter(assigned_at__date=today)
        assignments_count = assignments_today.count()
        assignments_revenue = assignments_today.aggregate(
            total=Sum(F('product__price') * F('quantity'))
        )['total'] or 0

        # Calculate from InstallmentPlan (Installment Sales)
        installments_today = InstallmentPlan.objects.filter(created_at__date=today)
        installments_count = installments_today.count()
        installments_revenue = installments_today.aggregate(total=Sum('total_amount'))['total'] or 0

        today_sales_count = assignments_count + installments_count
        today_revenue = assignments_revenue + installments_revenue
        
        pending_service_count = ServiceRequest.objects.filter(status='pending').count()
        total_customers_count = CustomUser.objects.filter(role='customer').count()

        # 2. Revenue by Category
        category_revenue = (
            ProductAssignment.objects.values('product__category__name')
            .annotate(total_revenue=Sum(F('product__price') * F('quantity')))
            .order_by('-total_revenue')[:5]
        )
        
        cat_labels = [item['product__category__name'] or 'Diğer' for item in category_revenue]
        cat_data = [float(item['total_revenue'] or 0) for item in category_revenue]

        # 3. Top Products (Best Sellers)
        top_products_qs = (
            ProductAssignment.objects.values('product__name')
            .annotate(sales_count=Sum('quantity'))
            .order_by('-sales_count')[:5]
        )
        
        prod_labels = [item['product__name'] for item in top_products_qs]
        prod_data = [item['sales_count'] for item in top_products_qs]

        # 4. Customer Segments
        month_ago = timezone.now() - timedelta(days=30)
        active_customers = CustomUser.objects.filter(role='customer', last_login__gte=month_ago).count()
        inactive_customers = CustomUser.objects.filter(role='customer', last_login__lt=month_ago).count()
        new_customers = CustomUser.objects.filter(role='customer', date_joined__gte=month_ago).count()
        
        loyal_count = ProductAssignment.objects.values('customer').annotate(count=Count('id')).filter(count__gt=5).count()
        potential_count = ProductAssignment.objects.values('customer').annotate(count=Count('id')).filter(count__range=(1, 5)).count()
        
        segment_labels = ["Sadık Müşteri (>5 Sipariş)", "Potansiyel (1-5 Sipariş)", "Yeni Üye (<30 Gün)", "Pasif"]
        segment_data = [loyal_count, potential_count, new_customers, inactive_customers]

        # 5. Service by Status
        service_stats = (
            ServiceRequest.objects.values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
        status_map = dict(ServiceRequest.STATUS_CHOICES)
        svc_labels = [status_map.get(item['status'], item['status']) for item in service_stats]
        svc_data = [item['count'] for item in service_stats]

        data = {
            "summary": {
                "today_sales": today_sales_count,
                "today_revenue": float(today_revenue),
                "pending_service": pending_service_count,
                "total_customers": total_customers_count,
            },
            "revenue_by_category": {
                "labels": cat_labels if cat_labels else ["Veri Yok"],
                "datasets": [{"data": cat_data if cat_data else [0]}]
            },
            "top_products": {
                "labels": prod_labels if prod_labels else ["Satış Yok"],
                "datasets": [{"data": prod_data if prod_data else [0]}]
            },
            "customer_segments": {
                "labels": segment_labels,
                "datasets": [{"data": segment_data}]
            },
            "service_by_status": {
                "labels": svc_labels if svc_labels else ["Talep Yok"],
                "datasets": [{"data": svc_data if svc_data else [0]}]
            }
        }
        return response.Response(data)


class SalesForecastView(views.APIView):
    """
    Real database-based sales forecast.
    Calculates trend based on historical ProductAssignment data.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # Get products with their sales data from last 3 months
        three_months_ago = timezone.now() - timedelta(days=90)
        two_months_ago = timezone.now() - timedelta(days=60)
        one_month_ago = timezone.now() - timedelta(days=30)
        
        # Get products with sales activity
        products_with_sales = (
            ProductAssignment.objects
            .filter(assigned_at__gte=three_months_ago)
            .values('product_id')
            .annotate(total_sales=Sum('quantity'))
            .order_by('-total_sales')[:20]
        )
        
        product_ids = [p['product_id'] for p in products_with_sales]
        products = Product.objects.filter(id__in=product_ids).select_related('category')
        
        forecasts = []
        
        for product in products:
            # Get sales for each month period
            month1_sales = ProductAssignment.objects.filter(
                product=product,
                assigned_at__gte=three_months_ago,
                assigned_at__lt=two_months_ago
            ).aggregate(total=Sum('quantity'))['total'] or 0
            
            month2_sales = ProductAssignment.objects.filter(
                product=product,
                assigned_at__gte=two_months_ago,
                assigned_at__lt=one_month_ago
            ).aggregate(total=Sum('quantity'))['total'] or 0
            
            month3_sales = ProductAssignment.objects.filter(
                product=product,
                assigned_at__gte=one_month_ago
            ).aggregate(total=Sum('quantity'))['total'] or 0
            
            # Calculate trend
            if month3_sales > month2_sales > month1_sales:
                trend = 'increasing'
            elif month3_sales < month2_sales < month1_sales:
                trend = 'decreasing'
            else:
                trend = 'stable'
            
            # Simple forecast: project based on trend
            avg_sales = (month1_sales + month2_sales + month3_sales) / 3 if (month1_sales + month2_sales + month3_sales) > 0 else 1
            
            if trend == 'increasing':
                growth_rate = 1.15
                recommendation = "Stok artırılmalı - talep artıyor"
            elif trend == 'decreasing':
                growth_rate = 0.9
                recommendation = "Kampanya yapılmalı - satışlar düşüyor"
            else:
                growth_rate = 1.0
                recommendation = "Mevcut stok seviyesi korunabilir"
            
            # Generate predictions for next 3 months
            pred1 = int(month3_sales * growth_rate) if month3_sales > 0 else int(avg_sales)
            pred2 = int(pred1 * growth_rate)
            pred3 = int(pred2 * growth_rate)
            
            forecasts.append({
                "product_name": product.name,
                "brand": product.brand or "Beko",
                "current_stock": product.stock,
                "trend": trend,
                "historical_sales": {
                    "month_1": month1_sales,
                    "month_2": month2_sales,
                    "month_3": month3_sales,
                },
                "forecasts": [
                    {"month": "Ay 1", "predicted_sales": max(pred1, 1)},
                    {"month": "Ay 2", "predicted_sales": max(pred2, 1)},
                    {"month": "Ay 3", "predicted_sales": max(pred3, 1)},
                ],
                "recommendation": recommendation
            })
        
        # If no products found, return empty state message
        if not forecasts:
            # Get some products anyway for display
            all_products = Product.objects.all()[:5]
            for product in all_products:
                forecasts.append({
                    "product_name": product.name,
                    "brand": product.brand or "Beko",
                    "current_stock": product.stock,
                    "trend": "stable",
                    "historical_sales": {"month_1": 0, "month_2": 0, "month_3": 0},
                    "forecasts": [
                        {"month": "Ay 1", "predicted_sales": 1},
                        {"month": "Ay 2", "predicted_sales": 1},
                        {"month": "Ay 3", "predicted_sales": 1},
                    ],
                    "recommendation": "Henüz satış verisi yok"
                })
        
        return response.Response({"top_forecasts": forecasts})


class SeasonalAnalysisView(views.APIView):
    """
    Mevsimsel Satış Analizi.
    Her ürünün hangi aylarda daha çok sattığını analiz eder.
    Örn: Klimalar Haziran-Ağustos, Isıtıcılar Kasım-Şubat.
    """
    permission_classes = [permissions.AllowAny]

    MONTH_NAMES_TR = {
        1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan",
        5: "Mayıs", 6: "Haziran", 7: "Temmuz", 8: "Ağustos",
        9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık"
    }

    def get(self, request):
        from django.db.models.functions import ExtractMonth
        
        # Son 12 ay veya tüm geçmiş veri
        one_year_ago = timezone.now() - timedelta(days=365)
        
        # Ürün bazlı aylık satış verileri
        monthly_sales = (
            ProductAssignment.objects
            .filter(assigned_at__gte=one_year_ago)
            .annotate(month=ExtractMonth('assigned_at'))
            .values('product_id', 'product__name', 'product__category__name', 'month')
            .annotate(total_sales=Sum('quantity'))
            .order_by('product_id', 'month')
        )
        
        # Ürünleri grupla
        products_data = {}
        for item in monthly_sales:
            pid = item['product_id']
            if pid not in products_data:
                products_data[pid] = {
                    "product_name": item['product__name'],
                    "category": item['product__category__name'] or "Diğer",
                    "monthly_sales": {m: 0 for m in range(1, 13)},
                    "total_year_sales": 0
                }
            products_data[pid]["monthly_sales"][item['month']] = item['total_sales']
            products_data[pid]["total_year_sales"] += item['total_sales']
        
        # Sonuçları hazırla
        seasonal_products = []
        for pid, data in products_data.items():
            monthly = data["monthly_sales"]
            total = data["total_year_sales"]
            
            if total == 0:
                continue
            
            # En yüksek satış yapılan ay
            peak_month = max(monthly, key=monthly.get)
            peak_sales = monthly[peak_month]
            
            # Mevsimsellik skoru (ne kadar belirgin bir tepe varsa o kadar yüksek)
            # Standart sapma / ortalama
            avg_sales = total / 12
            if avg_sales > 0:
                variance = sum((s - avg_sales) ** 2 for s in monthly.values()) / 12
                std_dev = variance ** 0.5
                seasonality_score = round(min(std_dev / avg_sales, 2.0), 2)
            else:
                seasonality_score = 0
            
            # Öneri oluştur
            if seasonality_score > 1.0:
                recommendation = f"{self.MONTH_NAMES_TR[peak_month]} ayında stok artır"
            elif seasonality_score > 0.5:
                recommendation = "Mevsimsel dalgalanma var, dikkatli takip et"
            else:
                recommendation = "Yıl boyunca dengeli satış"
            
            # Aylık satışları Türkçe ay isimleriyle
            monthly_sales_tr = {
                self.MONTH_NAMES_TR[m]: s for m, s in monthly.items()
            }
            
            seasonal_products.append({
                "product_id": pid,
                "product_name": data["product_name"],
                "category": data["category"],
                "peak_month": self.MONTH_NAMES_TR[peak_month],
                "peak_sales": peak_sales,
                "total_year_sales": total,
                "monthly_sales": monthly_sales_tr,
                "seasonality_score": seasonality_score,
                "recommendation": recommendation
            })
        
        # En yüksek toplam satışlara göre sırala
        seasonal_products.sort(key=lambda x: x["total_year_sales"], reverse=True)
        
        # Kategori bazlı özet
        category_summary = {}
        for product in seasonal_products[:20]:  # İlk 20 ürün
            cat = product["category"]
            if cat not in category_summary:
                category_summary[cat] = {"peak_months": [], "products_count": 0}
            category_summary[cat]["peak_months"].append(product["peak_month"])
            category_summary[cat]["products_count"] += 1
        
        # Her kategori için en sık görülen tepe aylar
        for cat in category_summary:
            months = category_summary[cat]["peak_months"]
            if months:
                # En çok tekrar eden 3 ay
                from collections import Counter
                top_months = [m for m, _ in Counter(months).most_common(3)]
                category_summary[cat]["peak_months"] = top_months
        
        return response.Response({
            "seasonal_products": seasonal_products[:20],  # İlk 20 ürün
            "category_summary": category_summary,
            "data_period": {
                "start": one_year_ago.strftime("%Y-%m-%d"),
                "end": timezone.now().strftime("%Y-%m-%d")
            }
        })

class MarketingAutomationView(views.APIView):
    """
    Real database-based marketing automation.
    Identifies eligible customers for various campaigns.
    Also provides sales chart data for marketing analysis.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            today = timezone.now().date()
            
            # 1. Anniversary Campaign - customers who joined in this month (instead of birthday)
            # Note: birth_date field does not exist in CustomUser model
            anniversary_eligible = CustomUser.objects.filter(
                role='customer',
                date_joined__month=today.month
            ).count()

            
            # 2. Churn Prevention
            ninety_days_ago = timezone.now() - timedelta(days=90)
            churn_eligible = CustomUser.objects.filter(
                role='customer',
                last_login__lt=ninety_days_ago
            ).count()
            
            # 3. Review Request
            thirty_days_ago = timezone.now() - timedelta(days=30)
            recent_buyers = ProductAssignment.objects.filter(
                assigned_at__gte=thirty_days_ago
            ).values_list('customer_id', flat=True).distinct()
            
            review_eligible = len(set(recent_buyers))
            
            # 4. Welcome Campaign
            seven_days_ago = timezone.now() - timedelta(days=7)
            welcome_eligible = CustomUser.objects.filter(
                role='customer',
                date_joined__gte=seven_days_ago
            ).count()
            
            # 5. Installment Reminder
            from products.models import Installment
            # FIXED: 'pending' instead of 'PENDING' to match model choices
            pending_installments = Installment.objects.filter(
                status='pending',
                due_date__lte=today + timedelta(days=7)
            ).values('plan__customer').distinct().count()
            
            # 6. Delivery Follow-up
            recent_deliveries = Delivery.objects.filter(
                status='DELIVERED',
                delivered_at__gte=thirty_days_ago
            ).values('assignment__customer').distinct().count()

            # ==========================================
            # SALES CHARTS DATA (Weekly / Monthly / Yearly)
            # ==========================================
            
            # 1. Weekly Sales
            weekly_stats = []
            for i in range(6, -1, -1):
                day = today - timedelta(days=i)
                # Using range for date to be safe with datetimes
                day_start = timezone.make_aware(timezone.datetime.combine(day, timezone.datetime.min.time()))
                day_end = timezone.make_aware(timezone.datetime.combine(day, timezone.datetime.max.time()))
                
                sales = ProductAssignment.objects.filter(
                    assigned_at__range=(day_start, day_end)
                ).aggregate(total=Sum('quantity'))['total'] or 0
                
                revenue = ProductAssignment.objects.filter(
                    assigned_at__range=(day_start, day_end)
                ).aggregate(
                    total=Sum(F('product__price') * F('quantity'))
                )['total'] or 0
                
                weekly_stats.append({
                    "label": day.strftime("%d %b"),
                    "sales": sales,
                    "revenue": float(revenue)
                })

            # 2. Monthly Sales
            monthly_stats = []
            monthly_data_qs = ProductAssignment.objects.filter(
                assigned_at__date__gte=thirty_days_ago
            ).values('assigned_at__date').annotate(
                total_sales=Sum('quantity'),
                total_revenue=Sum(F('product__price') * F('quantity'))
            ).order_by('assigned_at__date')
            
            monthly_map = {item['assigned_at__date']: item for item in monthly_data_qs}
            
            for i in range(29, -1, -1):
                day = today - timedelta(days=i)
                stats = monthly_map.get(day, {'total_sales': 0, 'total_revenue': 0})
                monthly_stats.append({
                    "label": day.strftime("%d %b"),
                    "sales": stats['total_sales'] or 0,
                    "revenue": float(stats['total_revenue'] or 0)
                })

            # 3. Yearly Sales
            from django.db.models.functions import ExtractMonth, ExtractYear
            one_year_ago = today - timedelta(days=365)
            
            yearly_data_qs = ProductAssignment.objects.filter(
                assigned_at__date__gte=one_year_ago
            ).annotate(
                month=ExtractMonth('assigned_at'),
                year=ExtractYear('assigned_at')
            ).values('year', 'month').annotate(
                total_sales=Sum('quantity'),
                total_revenue=Sum(F('product__price') * F('quantity'))
            ).order_by('year', 'month')
            
            yearly_stats = []
            yearly_map = {(item['year'], item['month']): item for item in yearly_data_qs}
            
            current_date = date(today.year, today.month, 1)
            for i in range(11, -1, -1):
                target_year = current_date.year
                target_month = current_date.month - i
                while target_month <= 0:
                    target_month += 12
                    target_year -= 1
                
                stats = yearly_map.get((target_year, target_month), {'total_sales': 0, 'total_revenue': 0})
                month_name = date(target_year, target_month, 1).strftime("%B")
                tr_months = {"January": "Ocak", "February": "Şubat", "March": "Mart", "April": "Nisan", "May": "Mayıs", "June": "Haziran", "July": "Temmuz", "August": "Ağustos", "September": "Eylül", "October": "Ekim", "November": "Kasım", "December": "Aralık"}
                
                yearly_stats.append({
                    "label": tr_months.get(month_name, month_name),
                    "sales": stats['total_sales'] or 0,
                    "revenue": float(stats['total_revenue'] or 0)
                })
            
            data = {
                "campaigns": {
                    "anniversary": {
                        "eligible": anniversary_eligible,
                        "description": "Bu ay kayıt yıldönümü olan müşteriler"
                    },
                    "churn_prevention": {
                        "eligible": churn_eligible,
                        "description": "90+ gün inaktif müşteriler"
                    },
                    "review_request": {
                        "eligible": review_eligible,
                        "description": "Son 30 günde alışveriş yapan müşteriler"
                    },
                    "welcome": {
                        "eligible": welcome_eligible,
                        "description": "Son 7 günde kayıt olan yeni müşteriler"
                    },
                    "installment_reminder": {
                        "eligible": pending_installments,
                        "description": "7 gün içinde taksit ödemesi olan müşteriler"
                    },
                    "delivery_feedback": {
                        "eligible": recent_deliveries,
                        "description": "Son 30 günde teslimat alan müşteriler"
                    }
                },
                "summary": {
                    "total_customers": CustomUser.objects.filter(role='customer').count(),
                    "active_last_30_days": CustomUser.objects.filter(
                        role='customer',
                        last_login__gte=thirty_days_ago
                    ).count(),
                    "total_campaigns": 6
                },
                "sales_chart": {
                    "weekly": weekly_stats,
                    "monthly": monthly_stats,
                    "yearly": yearly_stats
                }
            }
            return response.Response(data)

        except Exception as e:
            traceback.print_exc()
            return response.Response(
                {
                    "error": str(e), 
                    "traceback": traceback.format_exc(),
                    "detail": "Internal Server Error in Marketing View"
                }, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def post(self, request):
        """Run a marketing campaign"""
        campaign = request.data.get('campaign')
        dry_run = request.data.get('dry_run', True)
        
        today = timezone.now().date()
        target_customers = []
        
        if campaign == 'anniversary':
             # Anniversary campaign: customers who joined this month
             target_customers = list(CustomUser.objects.filter(
                role='customer',
                date_joined__month=today.month
            ).values_list('email', 'first_name'))
            
        elif campaign == 'churn_prevention':
            ninety_days_ago = timezone.now() - timedelta(days=90)
            target_customers = list(CustomUser.objects.filter(
                role='customer',
                last_login__lt=ninety_days_ago
            ).values_list('email', 'first_name'))
            
        elif campaign == 'review_request':
            thirty_days_ago = timezone.now() - timedelta(days=30)
            customer_ids = ProductAssignment.objects.filter(
                assigned_at__gte=thirty_days_ago
            ).values_list('customer_id', flat=True).distinct()
            target_customers = list(CustomUser.objects.filter(
                id__in=customer_ids
            ).values_list('email', 'first_name'))

        elif campaign == 'welcome':
            seven_days_ago = timezone.now() - timedelta(days=7)
            target_customers = list(CustomUser.objects.filter(
                role='customer',
                date_joined__gte=seven_days_ago
            ).values_list('email', 'first_name'))
            
        elif campaign == 'installment_reminder':
            from products.models import Installment
            customer_ids = Installment.objects.filter(
                status='PENDING',
                due_date__lte=today + timedelta(days=7)
            ).values_list('plan__customer_id', flat=True).distinct()
            target_customers = list(CustomUser.objects.filter(
                id__in=customer_ids
            ).values_list('email', 'first_name'))
            
        elif campaign == 'delivery_feedback':
            thirty_days_ago = timezone.now() - timedelta(days=30)
            customer_ids = Delivery.objects.filter(
                status='DELIVERED',
                delivered_at__gte=thirty_days_ago
            ).values_list('assignment__customer_id', flat=True).distinct()
            target_customers = list(CustomUser.objects.filter(
                id__in=customer_ids
            ).values_list('email', 'first_name'))
        
        result = {
            "status": "success",
            "campaign": campaign,
            "mode": "dry_run" if dry_run else "live",
            "target_count": len(target_customers),
            "message": f"Kampanya '{campaign}' {'simüle edildi' if dry_run else 'başlatıldı'}."
        }
        
        if dry_run:
            # Show sample of target customers
            result["sample_targets"] = [
                {"email": email, "name": name} 
                for email, name in target_customers[:5]
            ]
        else:
            # In production, you would send actual emails here
            # For now, just log the action
            result["emails_sent"] = len(target_customers)
            
            # Create audit log
            AuditLog.objects.create(
                user=request.user if request.user.is_authenticated else None,
                action='Oluşturma',
                model='MarketingCampaign',
                description=f"'{campaign}' kampanyası {len(target_customers)} müşteriye gönderildi",
                ip_address=request.META.get('REMOTE_ADDR')
            )
        
        return response.Response(result)


class AuditLogView(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    queryset = AuditLog.objects.all().order_by('-timestamp')
    serializer_class = AuditLogSerializer

    def list(self, request):
        """Override list to return logs in expected format"""
        limit = int(request.query_params.get('limit', 50))
        queryset = self.get_queryset()[:limit]
        serializer = self.get_serializer(queryset, many=True)
        return response.Response({"logs": serializer.data})

    @action(detail=False, methods=['get'])
    def get_logs(self, request):
        limit = int(request.query_params.get('limit', 50))
        queryset = self.get_queryset()[:limit]
        serializer = self.get_serializer(queryset, many=True)
        return response.Response({"logs": serializer.data})
