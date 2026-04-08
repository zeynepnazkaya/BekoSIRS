from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0028_merge_20260408_1710'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, blank=True, null=True),
        ),
    ]
