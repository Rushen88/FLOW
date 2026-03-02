import re

path = 'd:/B2B/FLOW/frontend/src/pages/OrdersPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Add viewMode state
view_state_add = """  const [filterSource, setFilterSource] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban')
"""
text = text.replace("  const [filterSource, setFilterSource] = useState('')\n", view_state_add)

# Add ToggleButtonGroup to imports
if 'ToggleButtonGroup' not in text:
    text = text.replace('Divider, Switch, FormControlLabel,', 'Divider, Switch, FormControlLabel, ToggleButtonGroup, ToggleButton, Card, CardContent,')
if 'ViewList' not in text:
    text = text.replace('LocalShipping, CheckCircle, Cancel,', 'LocalShipping, CheckCircle, Cancel, ViewList, ViewKanban, AccessTime, Person,')


# The UI changes for toggles and render
filter_box_ui = """        {/* Filters */}
        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => { if (v) setViewMode(v) }}
            size="small"
          >
            <ToggleButton value="list"><ViewList fontSize="small" /></ToggleButton>
            <ToggleButton value="kanban"><ViewKanban fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
"""

# replace:
text = text.replace('        {/* Filters */}\n        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: \'wrap\' }}>', filter_box_ui)

# Add drag and drop handlers logic above return (
dnd_logic = """
  // ─── Kanban Drag & Drop ───
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData('text/plain', orderId);
  }
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  }
  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData('text');
    if (!orderId) return;
    
    // Optimistic update
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    
    try {
      await api.patch(`/sales/orders/${orderId}/`, { status: newStatus });
      notify('Статус обновлён');
    } catch (err) {
      notify(extractError(err, 'Ошибка смены статуса'), 'error');
      fetchOrders(); // rollback
    }
  }

  const kanbanColumns = [
    { value: 'new', label: 'Новые', color: '#e3f2fd', br: '#90caf9' },
    { value: 'confirmed', label: 'Подтверждён', color: '#e8eaf6', br: '#90caf9' },
    { value: 'in_assembly', label: 'В сборке', color: '#fff3e0', br: '#ffb74d' },
    { value: 'assembled', label: 'Собран', color: '#f3e5f5', br: '#ce93d8' },
    { value: 'on_delivery', label: 'В доставке', color: '#e1f5fe', br: '#81d4fa' },
  ]
"""
text = text.replace('  return (\n    <Box>', dnd_logic + '\n  return (\n    <Box>')

kanban_render = """
        {viewMode === 'list' ? (
          <DataTable
            columns={columns}
            rows={orders}
            loading={loading}
            search={search}
            onSearchChange={v => { setSearch(v); setPage(1) }}
            searchPlaceholder="Поиск по номеру..."
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            emptyText="Заказов пока нет"
          />
        ) : (
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, minHeight: '60vh' }}>
            {kanbanColumns.map(col => (
              <Box 
                key={col.value} 
                onDragOver={handleDragOver} 
                onDrop={e => handleDrop(e, col.value)}
                sx={{ 
                  flex: '0 0 300px', 
                  bgcolor: col.color, 
                  borderRadius: 2, 
                  p: 1.5,
                  borderTop: `4px solid ${col.br}`,
                  display: 'flex', flexDirection: 'column', gap: 1
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, px: 1 }}>
                  {col.label} ({orders.filter(o => o.status === col.value).length})
                </Typography>
                
                {orders.filter(o => o.status === col.value).map(order => (
                  <Card 
                    key={order.id} 
                    draggable 
                    onDragStart={e => handleDragStart(e, order.id)}
                    sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' }, transition: 'all 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 } }}
                    onClick={() => openDetail(order)}
                  >
                    <CardContent sx={{ p: 1.5, pb: '12px !important' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" fontWeight={700}>#{order.number}</Typography>
                        <Typography variant="caption" fontWeight={700}>{fmtCurrency(order.total)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, color: 'text.secondary' }}>
                        <Person sx={{ fontSize: 14 }} />
                        <Typography variant="caption" noWrap>{order.customer_name || 'Неизвестный'}</Typography>
                      </Box>
                      {order.delivery_date && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'error.main' }}>
                          <AccessTime sx={{ fontSize: 14 }} />
                          <Typography variant="caption" fontWeight={600}>
                            {fmtDate(order.delivery_date)} {order.delivery_time_from ? `${order.delivery_time_from.slice(0,5)}-${order.delivery_time_to?.slice(0,5)}` : ''}
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            ))}
          </Box>
        )}
"""

# Replace DataTable render
import re
text = re.sub(
    r'<DataTable\s+columns=\{columns\}.*?/>',
    lambda match: kanban_render,
    text,
    flags=re.DOTALL
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("done")
