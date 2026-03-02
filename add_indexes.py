import sys

# Update backend/apps/nomenclature/models.py
with open('backend/apps/nomenclature/models.py', 'r', encoding='utf-8') as f:
    text = f.read()

target_meta = """    class Meta:
        db_table = 'nomenclatures'
        verbose_name = 'Номенклатура'
        verbose_name_plural = 'Номенклатура'"""

replacement_meta = """    class Meta:
        db_table = 'nomenclatures'
        verbose_name = 'Номенклатура'
        verbose_name_plural = 'Номенклатура'
        indexes = [
            models.Index(fields=['organization', 'nomenclature_type']),
            models.Index(fields=['organization', 'is_active', 'is_deleted']),
        ]"""

text = text.replace(target_meta, replacement_meta)
with open('backend/apps/nomenclature/models.py', 'w', encoding='utf-8') as f:
    f.write(text)


# Update backend/apps/inventory/models.py
with open('backend/apps/inventory/models.py', 'r', encoding='utf-8') as f:
    text2 = f.read()

target_meta_2 = """    class Meta:
        db_table = 'stock_balances'
        verbose_name = 'Остаток на складе'
        verbose_name_plural = 'Остатки на складах'
        constraints = [
            models.UniqueConstraint(
                fields=['warehouse', 'nomenclature'],
                name='unique_stock_balance'
            )
        ]"""

replacement_meta_2 = """    class Meta:
        db_table = 'stock_balances'
        verbose_name = 'Остаток на складе'
        verbose_name_plural = 'Остатки на складах'
        constraints = [
            models.UniqueConstraint(
                fields=['warehouse', 'nomenclature'],
                name='unique_stock_balance'
            )
        ]
        indexes = [
            models.Index(fields=['organization', 'warehouse']),
            models.Index(fields=['organization', 'nomenclature']),
        ]"""

text2 = text2.replace(target_meta_2, replacement_meta_2)
with open('backend/apps/inventory/models.py', 'w', encoding='utf-8') as f:
    f.write(text2)

print("Indexes added")
