"""
Vadesi geçmiş taksitler için otomatik durum güncelleme ve bildirim gönderme command'ı.

Kullanım:
    python manage.py check_overdue_installments
    python manage.py check_overdue_installments --dry-run

Cron job olarak günlük çalıştırılabilir:
    0 8 * * * cd /path/to/project && python manage.py check_overdue_installments
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from products.models import Installment, Notification


class Command(BaseCommand):
    help = 'Vadesi geçmiş taksitleri tespit eder, durumunu overdue yapar ve müşteriye bildirim gönderir'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Değişiklik yapmadan sadece kaç taksit etkileneceğini göster'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        today = timezone.now().date()

        self.stdout.write(f'Vadesi geçmiş taksitler kontrol ediliyor ({today})...')

        # due_date geçmiş, henüz ödenmemiş veya overdue işaretlenmemiş taksitler
        overdue_installments = Installment.objects.filter(
            due_date__lt=today,
            status__in=['pending', 'customer_confirmed'],
        ).select_related('plan__customer', 'plan__product')

        count = overdue_installments.count()
        self.stdout.write(f'{count} adet vadesi geçmiş taksit bulundu.')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN: Hiçbir değişiklik yapılmadı.'))
            for inst in overdue_installments:
                days_late = (today - inst.due_date).days
                self.stdout.write(
                    f'  - {inst.plan.customer.email}: Taksit #{inst.installment_number} '
                    f'({inst.plan.product.name}) — {days_late} gün gecikmiş'
                )
            return

        notifications = []
        updated_ids = []

        for inst in overdue_installments:
            customer = inst.plan.customer

            # Son 7 gün içinde bu plan için overdue bildirimi gönderilmiş mi?
            already_notified = Notification.objects.filter(
                user=customer,
                notification_type='general',
                title__startswith='Gecikmiş Taksit',
                created_at__gte=timezone.now() - timedelta(days=7),
                related_product=inst.plan.product,
            ).exists()

            updated_ids.append(inst.pk)

            if not already_notified:
                days_late = (today - inst.due_date).days
                notifications.append(
                    Notification(
                        user=customer,
                        notification_type='general',
                        title='Gecikmiş Taksit Bildirimi',
                        message=(
                            f'{inst.plan.product.name} ürününüz için {inst.installment_number}. '
                            f'taksit ödemesi {inst.due_date.strftime("%d.%m.%Y")} tarihinde '
                            f'vadesi doldu ({days_late} gün gecikmiş). '
                            f'Lütfen en kısa sürede ödemenizi gerçekleştirin.'
                        ),
                        related_product=inst.plan.product,
                    )
                )

        # Taksit durumlarını toplu güncelle
        if updated_ids:
            Installment.objects.filter(pk__in=updated_ids).update(status='overdue')
            self.stdout.write(
                self.style.SUCCESS(f'{len(updated_ids)} taksit "overdue" olarak güncellendi.')
            )

        # Bildirimleri toplu oluştur
        if notifications:
            Notification.objects.bulk_create(notifications)
            self.stdout.write(
                self.style.SUCCESS(f'{len(notifications)} bildirim oluşturuldu.')
            )
        else:
            self.stdout.write('Gönderilecek yeni bildirim yok (zaten bildirilmiş).')
