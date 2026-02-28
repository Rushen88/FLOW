import re

# Fix InventoryPage.tsx
with open('frontend/src/pages/InventoryPage.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('<SwapHoriz, RemoveCircleOutline />', '<SwapHoriz />')
with open('frontend/src/pages/InventoryPage.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

# Fix OrdersPage.tsx
with open('frontend/src/pages/OrdersPage.tsx', 'r', encoding='utf-8') as f:
    oc = f.read()

# Fix the checkout post URL
oc = re.sub(r'api\.post\(/sales.*?checkout/\)', 'api.post(`/sales/orders/${detailOrder.id}/checkout/`)', oc)

# Fix the malformed Button JSX
bad_btn = """              <Button 
                variant=contained\\ 
                color=success\\ 
                disabled={statusChanging || checkoutLoading} 
                onClick={handleCheckout}
                startIcon={<ShoppingBag />}
                size=\\medium              >
                Пробить Чек / Выдать
              </Button>"""

good_btn = """              <Button 
                variant="contained" 
                color="success" 
                disabled={statusChanging || checkoutLoading} 
                onClick={handleCheckout}
                startIcon={<ShoppingBag />}
                size="medium"
              >
                Пробить Чек / Выдать
              </Button>"""

oc = oc.replace(bad_btn, good_btn)

with open('frontend/src/pages/OrdersPage.tsx', 'w', encoding='utf-8') as f:
    f.write(oc)
print("Fixed files successfully")