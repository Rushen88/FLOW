with open('frontend/src/pages/OrdersPage.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

old_str = '''                {STATUS_CHOICES.filter(s => s.value !== detailOrder.status).map(s => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </TextField>
            </Box>'''

new_str = old_str.replace('            </Box>', '''            </Box>
            <Box sx={{ display: \\'flex\\', justifyContent: \\'flex-end\\', mt: 2 }}>
              <Button 
                variant=\
contained\ 
                color=\success\ 
                disabled={statusChanging ; checkoutLoading} 
                onClick={handleCheckout}
                startIcon={<ShoppingBag />}
                size=\medium\
              >
                Пробить Чек / Выдать
              </Button>
            </Box>'''.replace('\\\\', ''))

if old_str in c:
    c = c.replace(old_str, new_str)
    with open('frontend/src/pages/OrdersPage.tsx', 'w', encoding='utf-8') as f:
        f.write(c)
    print('Success: Button injected')
else:
    print('Error: Target string not found')

