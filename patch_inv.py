import re
with open('frontend/src/pages/InventoryPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

state_inject = '''  const [writeOffDlg, setWriteOffDlg] = useState(false)
  const [writeOffForm, setWriteOffForm] = useState({ warehouse: '', nomenclature: '', quantity: '1', reason: 'expired', notes: '' })
  const [writeOffSaving, setWriteOffSaving] = useState(false)
'''
content = content.replace('const [corrSaving, setCorrSaving] = useState(false)', 'const [corrSaving, setCorrSaving] = useState(false)\n' + state_inject)

handle_inject = '''
  const openWriteOffDlg = () => {
    setWriteOffForm({ warehouse: '', nomenclature: '', quantity: '1', reason: 'expired', notes: '' })
    setWriteOffDlg(true)
  }

  const submitWriteOff = async () => {
    try {
      setWriteOffSaving(true)
      await api.post('/inventory/movements/write-off/', writeOffForm)
      notify('Ручное списание успешно выполнено', 'success')
      setWriteOffDlg(false)
      loadData()
    } catch (e) {
      notify(extractError(e), 'error')
    } finally {
      setWriteOffSaving(false)
    }
  }
'''
content = content.replace('const submitCorrection = async () => {', handle_inject + '\n  const submitCorrection = async () => {')

btn_inject = '        <Button variant=\
outlined\ color=\error\ startIcon={<RemoveCircleOutline />} onClick={openWriteOffDlg}>Списать</Button>\n'
content = content.replace('<Button variant=\outlined\ color=\warning\ startIcon={<CallSplit />} onClick={openDasmDlg}>Раскомплектовать</Button>', '<Button variant=\outlined\ color=\warning\ startIcon={<CallSplit />} onClick={openDasmDlg}>Раскомплектовать</Button>\n' + btn_inject)

dlg_inject = '''
      {/* ─── ДИАЛОГ: СПИСАНИЕ ─── */}
      <Dialog open={writeOffDlg} onClose={() => setWriteOffDlg(false)} maxWidth=\sm\ fullWidth>
        <DialogTitle>Списать товар (Брак/Истек срок)</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth size=\small\>
                <InputLabel>Склад</InputLabel>
                <Select
                  value={writeOffForm.warehouse}
                  label=\Склад\
                  onChange={e => setWriteOffForm({ ...writeOffForm, warehouse: e.target.value })}
                >
                  {allWh.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Autocomplete
                size=\small\
                options={allNom}
                getOptionLabel={o => ${o.name} ()}
                onChange={(_, val) => setWriteOffForm({ ...writeOffForm, nomenclature: val?.id || '' })}
                renderInput={(params) => <TextField {...params} label=\Номенклатура\ />}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label=\Количество\
                type=\number\
                size=\small\
                fullWidth
                value={writeOffForm.quantity}
                onChange={e => setWriteOffForm({ ...writeOffForm, quantity: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size=\small\>
                <InputLabel>Причина</InputLabel>
                <Select
                  value={writeOffForm.reason}
                  label=\Причина\
                  onChange={e => setWriteOffForm({ ...writeOffForm, reason: e.target.value })}
                >
                  {WRITE_OFF_REASONS.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label=\Примечания
/
Описание
дефекта\
                size=\small\
                fullWidth
                multiline
                rows={2}
                value={writeOffForm.notes}
                onChange={e => setWriteOffForm({ ...writeOffForm, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWriteOffDlg(false)}>Отмена</Button>
          <Button variant=\contained\ color=\error\ onClick={submitWriteOff} disabled={writeOffSaving || !writeOffForm.warehouse || !writeOffForm.nomenclature}>
            {writeOffSaving ? 'Списание...' : 'Списать со склада'}
          </Button>
        </DialogActions>
      </Dialog>
'''
content = content.replace('{/* ─── ДИАЛОГ: КОРРЕКТИРОВКА ─── */}', dlg_inject + '\n      {/* ─── ДИАЛОГ: КОРРЕКТИРОВКА ─── */}')

content = content.replace('SwapHoriz', 'SwapHoriz, RemoveCircleOutline')

with open('frontend/src/pages/InventoryPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')

