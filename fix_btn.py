with open('frontend/src/pages/OrdersPage.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('disabled={statusChanging ; checkoutLoading}', 'disabled={statusChanging || checkoutLoading}')
c = c.replace('display: \\\\'flex\\\\', justifyContent: \\\\'flex-end\\\\'', 'display: \\'flex\\', justifyContent: \\'flex-end\\'')

with open('frontend/src/pages/OrdersPage.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

