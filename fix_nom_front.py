import sys

with open('frontend/src/pages/NomenclaturePage.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add fields to interface
target1 = "color: string; country: string"
replacement1 = "color: string; country: string; stem_length: number | null; diameter: number | null;"
text = text.replace(target1, replacement1)

# 2. Add to itemForm initial state
target2 = "color: '', country: '',"
replacement2 = "color: '', country: '', stem_length: '' as string | number, diameter: '' as string | number,"
text = text.replace(target2, replacement2)

# 3. Add to edit state loading
target3 = "markup_percent: item.markup_percent || '', color: item.color || '',"
replacement3 = "markup_percent: item.markup_percent || '', color: item.color || '', stem_length: item.stem_length ?? '', diameter: item.diameter ?? '',"
text = text.replace(target3, replacement3)

# 4. Add to UI
ui_target = """            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Страна" fullWidth value={itemForm.country}
                onChange={e => setItemForm({ ...itemForm, country: e.target.value })} />
            </Grid>"""
ui_replacement = """            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Страна" fullWidth value={itemForm.country}
                onChange={e => setItemForm({ ...itemForm, country: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Линейка/Ростовка (см)" type="number" fullWidth value={itemForm.stem_length}
                onChange={e => setItemForm({ ...itemForm, stem_length: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Диаметр (см)" type="number" fullWidth value={itemForm.diameter}
                onChange={e => setItemForm({ ...itemForm, diameter: e.target.value })} />
            </Grid>"""
text = text.replace(ui_target, ui_replacement)

with open('frontend/src/pages/NomenclaturePage.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated Nomenclature frontend components")
