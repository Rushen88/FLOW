import sys

with open('backend/apps/nomenclature/models.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if 'stem_length =' in line or 'diameter =' in line:
        continue
    new_lines.append(line)
    if "color = models.CharField('Цвет'" in line:
        new_lines.append("    stem_length = models.PositiveIntegerField('Ростовка/Длина (см)', null=True, blank=True)\n")
        new_lines.append("    diameter = models.PositiveIntegerField('Диаметр (см)', null=True, blank=True)\n")

with open('backend/apps/nomenclature/models.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print('Fixed completely')
