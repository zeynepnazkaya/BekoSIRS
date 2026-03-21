from rest_framework import viewsets, permissions, status, decorators, response
from django.utils import timezone
from products.models import InstallmentPlan, Installment, Notification
from products.serializers import (
    InstallmentPlanSerializer, InstallmentPlanListSerializer,
    InstallmentPlanDetailSerializer, InstallmentPlanCreateSerializer,
    InstallmentSerializer, AdminApprovePaymentSerializer
)


def _mark_overdue_installments():
    """Vade tarihi geçmiş 'pending' taksitleri otomatik olarak 'overdue' yapar ve bildirim gönderir."""
    today = timezone.now().date()
    newly_overdue = list(
        Installment.objects.filter(
            status='pending',
            due_date__lt=today
        ).select_related('plan', 'plan__customer', 'plan__product')
    )

    if newly_overdue:
        Installment.objects.filter(
            status='pending',
            due_date__lt=today
        ).update(status='overdue')

        notifications = []
        for inst in newly_overdue:
            customer = inst.plan.customer
            product = inst.plan.product
            days_late = (today - inst.due_date).days
            notifications.append(Notification(
                user=customer,
                notification_type='general',
                title='Gecikmiş Taksit',
                message=(
                    f"{product.name if product else 'Ürününüz'} için "
                    f"{inst.installment_number}. taksidiniz {days_late} gün gecikmiş. "
                    f"Lütfen ödemenizi gerçekleştiriniz."
                ),
                related_product=product,
            ))
        Notification.objects.bulk_create(notifications, ignore_conflicts=True)


class InstallmentPlanViewSet(viewsets.ModelViewSet):
    queryset = InstallmentPlan.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return InstallmentPlanCreateSerializer
        elif self.action == 'list':
            return InstallmentPlanListSerializer
        elif self.action == 'retrieve':
            return InstallmentPlanDetailSerializer
        return InstallmentPlanSerializer

    def perform_create(self, serializer):
        # Create plan
        plan = serializer.save(created_by=self.request.user)

        # Auto-generate installments based on count and total amount
        total = plan.total_amount - plan.down_payment
        count = plan.installment_count
        amount_per_inst = total / count

        start_date = plan.start_date

        for i in range(1, count + 1):
            due_date = start_date + timezone.timedelta(days=30 * i)
            Installment.objects.create(
                plan=plan,
                installment_number=i,
                amount=amount_per_inst,
                due_date=due_date,
                status='pending'
            )

        # Notify customer
        product_name = plan.product.name if plan.product else 'Ürününüz'
        Notification.objects.create(
            user=plan.customer,
            notification_type='general',
            title='Taksit Planınız Oluşturuldu',
            message=(
                f"{product_name} için {count} taksitli ödeme planınız oluşturuldu. "
                f"Aylık taksit tutarı: {amount_per_inst:.2f} TL."
            ),
            related_product=plan.product,
        )

    def list(self, request, *args, **kwargs):
        _mark_overdue_installments()
        return super().list(request, *args, **kwargs)

    @decorators.action(detail=True, methods=['get'])
    def installments(self, request, pk=None):
        _mark_overdue_installments()
        plan = self.get_object()
        installments = plan.installments.all()
        serializer = InstallmentSerializer(installments, many=True)
        return response.Response(serializer.data)

    @decorators.action(detail=False, methods=['get'], url_path='my-plans')
    def my_plans(self, request):
        """GET /api/v1/installment-plans/my-plans/ - Customer's own installment plans."""
        _mark_overdue_installments()
        plans = InstallmentPlan.objects.filter(customer=request.user).prefetch_related('installments')
        serializer = InstallmentPlanSerializer(plans, many=True)
        return response.Response(serializer.data)


class InstallmentViewSet(viewsets.ModelViewSet):
    queryset = Installment.objects.all()
    serializer_class = InstallmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request, *args, **kwargs):
        _mark_overdue_installments()
        return super().list(request, *args, **kwargs)

    @decorators.action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        installment = self.get_object()
        serializer = AdminApprovePaymentSerializer(data=request.data)
        
        if serializer.is_valid():
            installment.status = 'paid'
            installment.payment_date = serializer.validated_data.get('payment_date', timezone.now().date())
            installment.admin_confirmed_at = timezone.now()
            installment.save()
            
            # Check if all paid, mark plan completed
            plan = installment.plan
            if not plan.installments.exclude(status='paid').exists():
                plan.status = 'completed'
                plan.save()
                
            return response.Response({'status': 'success'})
        return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @decorators.action(detail=True, methods=['post'], url_path='customer-confirm')
    def customer_confirm(self, request, pk=None):
        """POST /api/v1/installments/{id}/customer-confirm/ - Customer confirms they paid."""
        installment = self.get_object()
        
        # Only allow customer to confirm their own installments
        if installment.plan.customer != request.user:
            return response.Response({'error': 'Bu taksit size ait değil'}, status=status.HTTP_403_FORBIDDEN)
        
        if installment.status != 'pending':
            return response.Response({'error': 'Bu taksit zaten işlenmiş'}, status=status.HTTP_400_BAD_REQUEST)
        
        installment.status = 'customer_confirmed'
        installment.customer_confirmed_at = timezone.now()
        installment.save()
        
        return response.Response({'status': 'success', 'message': 'Ödeme onayı gönderildi'})
