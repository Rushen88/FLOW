import sys

with open('backend/apps/nomenclature/models.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = "'Цвет', max_length=50, blank=True, default=''"
if target in content:
    content = content.replace(
        "color = models.CharField('Цвет', max_length=50, blank=True, default='')",
        "color = models.CharField('Цвет', max_length=50, blank=True, default='')\n    stem_length = models.PositiveIntegerField('Ростовка/Длина (см)', null=True, blank=True)\n    diameter = models.PositiveIntegerField('Диаметр (см)', null=True, blank=True)"
    )
    with open('backend/apps/nomenclature/models.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated Nomenclature models')
else:
    print('Target string not found')
