import re

path = 'd:/B2B/FLOW/frontend/src/pages/OrdersPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('label="Анонимно"', 'label="Анонимно" /> <FormControlLabel control={<Switch checked={orderForm.ask_recipient_address} onChange={e => setOrderForm({...orderForm, ask_recipient_address: e.target.checked})} />} label="Уточнить адрес"  ')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("done")
