import sys
with open('backend/apps/nomenclature/models.py', 'r', encoding='utf-8') as f:
    text = f.read()

import re
# Find all stems and diameters and color line
text = re.sub(r"    color = models.CharField[(]'Цвет', max_length=50, blank=True, default=''\n.*?\n.*?\n.*?\n.*?\n", "    color = models.CharField('Цвет', max_length=50, blank=True, default='')\n    stem_length = models.PositiveIntegerField('Ростовка/Длина (см)', null=True, blank=True)\n    diameter = models.PositiveIntegerField('Диаметр (см)', null=True, blank=True)\n", text, flags=re.MULTILINE|re.DOTALL)

with open('backend/apps/nomenclature/models.py', 'w', encoding='utf-8') as f:
    f.write(text)
print("Cleaned up duplicates")
