from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0025_merge_20260322_0118'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='push_token',
            field=models.CharField(blank=True, max_length=200, null=True, verbose_name='Push Token'),
        ),
    ]
