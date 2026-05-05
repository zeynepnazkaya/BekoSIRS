from rest_framework import views, response, permissions
from products.models import Product, ProductAssignment
from django.utils import timezone
from datetime import timedelta
from django.db.models import Sum

class StockIntelligenceDashboardView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)
        
        products = Product.objects.all()
        total_products = products.count()
        
        critical_alerts = []
        warning_alerts = []
        opportunities = []
        
        # Calculate real sales last 30 days dictionary to avoid N+1
        recent_sales_query = ProductAssignment.objects.filter(
            assigned_at__gte=thirty_days_ago
        ).values('product_id').annotate(total_sales=Sum('quantity'))
        
        sales_dict = {item['product_id']: item['total_sales'] for item in recent_sales_query}
        
        healthy_count = 0

        for p in products:
            sales_30d = sales_dict.get(p.id, 0) or 0
            velocity = sales_30d / 30.0
            
            days_until_stockout = None
            if velocity > 0:
                days_until_stockout = p.stock / velocity
                
            est_cost = float(p.price) * 20 if p.price else 50000

            alert_data = {
                "product_id": p.id,
                "product_name": p.name,
                "brand": p.brand,
                "category": p.category.name if p.category else "Genel",
                "current_stock": p.stock,
                "sales_last_30_days": sales_30d,
                "velocity": velocity,
                "days_until_stockout": days_until_stockout,
                "recommended_order_qty": 20,
            }

            if p.stock <= 5:
                critical_alerts.append({
                    **alert_data,
                    "urgency": "critical",
                    "message": "Stok kritik seviyede, acil müdahale gerekli.",
                    "estimated_order_cost": est_cost
                })
            elif p.stock <= 15 and velocity > 0 and days_until_stockout and days_until_stockout < 30:
                warning_alerts.append({
                    **alert_data,
                    "urgency": "warning",
                    "message": f"Mevcut satış hızıyla {int(days_until_stockout)} gün içinde tükenecek.",
                    "estimated_order_cost": est_cost
                })
            elif p.stock >= 20 and velocity < 0.2:
                opportunities.append({
                    **alert_data,
                    "urgency": "opportunity",
                    "message": "Yüksek atıl stok. Bir kampanya düzenlenmesi yararlı olabilir."
                })
            else:
                healthy_count += 1
                
        # Calculate real Top Sellers (Top 5)
        top_sellers = list(
            ProductAssignment.objects.filter(assigned_at__gte=thirty_days_ago)
            .values('product__name', 'product__brand')
            .annotate(sales_count=Sum('quantity'))
            .order_by('-sales_count')[:10]
        )
        
        # Calculate real Low Performers (Bottom 10 products by sales)
        product_sales_list = []
        for p in products:
            sales = sales_dict.get(p.id, 0)
            product_sales_list.append({
                "name": p.name,
                "brand": p.brand,
                "stock": p.stock,
                "sales_count": sales
            })
            
        product_sales_list.sort(key=lambda x: (x["sales_count"], -x["stock"]))
        low_performers = product_sales_list[:10]

        data = {
            "summary": {
                "critical_count": len(critical_alerts),
                "warning_count": len(warning_alerts),
                "opportunity_count": len(opportunities),
                "healthy_count": healthy_count,
                "total_products": total_products,
            },
            "critical_alerts": sorted(critical_alerts, key=lambda x: x['current_stock']),
            "warning_alerts": sorted(warning_alerts, key=lambda x: x['days_until_stockout'] or 999),
            "opportunities": sorted(opportunities, key=lambda x: x['current_stock'], reverse=True),
            "top_sellers": top_sellers,
            "low_performers": low_performers
        }
        return response.Response(data)
