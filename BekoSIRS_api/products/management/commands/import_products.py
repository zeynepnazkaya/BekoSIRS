from django.core.management.base import BaseCommand
import pandas as pd
from products.models import Product, Category
import os
from decimal import Decimal, InvalidOperation

class Command(BaseCommand):
    help = 'Imports products from bekoproducts.xls'

    def handle(self, *args, **kwargs):
        file_path = 'bekoproducts.xls'
        # Check absolute path if relative fails
        if not os.path.exists(file_path):
            file_path = os.path.join(os.getcwd(), 'bekoproducts.xls')
            
        if not os.path.exists(file_path):
            self.stdout.write(self.style.ERROR(f'File not found: {file_path}'))
            return

        self.stdout.write(f"Reading {file_path}...")
        df = pd.read_excel(file_path, header=None) # using header=None to easier detect section headers

        current_category = None
        imported_count = 0
        
        # Iterate through all rows
        for index, row in df.iterrows():
            col0 = str(row[0]).strip() # EK GARANTİ KODU
            col1 = str(row[1]).strip() # Header Title
            
            # 1. Detect Header Row (Category)
            # A header usually has text in Col 1 like "Buzdolapları..." and Col 0 is "EK GARANTİ KODU" or Empty or "-"
            # OR Col 0 is "EK GARANTİ KODU" itself.
            
            if 'EK GARANTİ KODU' in col0 or 'EK GARANTİ KODU' in col1:
                # Potential Header Row or Column Title Row
                # If Col 1 has substantive text (longer than small code), it's likely a Category
                if len(col1) > 10 and 'Fiyat' not in col1:
                    cat_name = col1
                    # Clean header text
                    if "(Ölçüler" in cat_name:
                        cat_name = cat_name.split("(Ölçüler")[0].strip()
                    
                    category, _ = Category.objects.get_or_create(name=cat_name)
                    current_category = category
                    self.stdout.write(f"--- Category: {current_category.name}")
                continue

            # 2. Detect Value Row (Product)
            # Must have a price in Column 6 (Peşin Fiyat) - Index 6
            try:
                price_raw = row[6]
                if pd.isna(price_raw) or str(price_raw).strip() == '' or str(price_raw).lower() == 'peşin fiyat':
                    continue
                
                # Check for model code in col1
                model_code = col1
                if model_code == 'nan' or model_code == '': continue
                
                # Warranty code in col0
                warranty_code = col0 if col0 not in ['nan', '-'] else None
                
                description = str(row[2]) if not pd.isna(row[2]) else ""
                
                # Prices
                price_cash = Decimal(str(price_raw))
                price_list = Decimal(str(row[5])) if not pd.isna(row[5]) else None
                
                campaign = str(row[7]) if not pd.isna(row[7]) else None
                
                # Use current category or 'Uncategorized'
                if not current_category:
                    current_category, _ = Category.objects.get_or_create(name="Genel")
                
                # Create/Update Product
                Product.objects.update_or_create(
                    model_code=model_code,
                    defaults={
                        'name': f"{model_code} - {current_category.name}",
                        'category': current_category,
                        'description': description,
                        'warranty_code': warranty_code,
                        'price': price_cash,
                        'price_cash': price_cash,
                        'price_list': price_list,
                        'campaign_tag': campaign,
                        'stock': 10 # Default
                    }
                )
                imported_count += 1
                
            except (ValueError, InvalidOperation, IndexError):
                continue
                
        self.stdout.write(self.style.SUCCESS(f'Successfully imported {imported_count} products'))
