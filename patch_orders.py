import re
with open('frontend/src/pages/OrdersPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add checkout handle
checkout_handle = '''
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const handleCheckout = async () => {
    if (!detailOrder) return
    setCheckoutLoading(true)
    try {
      const res = await api.post(/sales/orders//checkout/)
      notify('Разделили: чек успешно создан и товары списаны со склада (смена обновлена)')
      setDetailDlg(false)
      fetchOrders()
    } catch (err) {
      notify(extractError(err, 'Ошибка при пробитии чека (нет открытой смены?)'), 'error')
    }
    setCheckoutLoading(false)
  }
'''

content = content.replace('const [delOrder, setDelOrder] = useState<Order | null>(null)', checkout_handle + '\n  const [delOrder, setDelOrder] = useState<Order | null>(null)')

# Add button to the top row
btn = '''
              <Button 
                variant=
contained 
                color=success 
                disabled={statusChanging ; checkoutLoading} 
                onClick={handleCheckout}
                startIcon={<ShoppingBag />}
                sx={{ ml: 2 }}
              >
                Пробить Чек / Выдать
              </Button>
'''
content = content.replace('</TextField>\\n            </Box>', '</TextField>\\n' + btn + '            </Box>')

with open('frontend/src/pages/OrdersPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

