import re

with open('frontend/src/pages/OrdersPage.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Using regex to find the entire Box block containing the broken button
pattern = r'<Box sx=\{\{\s*display:\s*"flex",\s*justifyContent:\s*"flex-end",\s*mt:\s*2\s*\}\}\>\s*<Button.*?Пробить Чек / Выдать\s*</Button>\s*</Box>'

good_box = """<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
              <Button 
                variant="contained" 
                color="success" 
                disabled={statusChanging || checkoutLoading} 
                onClick={handleCheckout}
                startIcon={<ShoppingBag />}
                size="medium"
              >
                Пробить Чек / Выдать
              </Button>
            </Box>"""

new_text = re.sub(pattern, good_box, text, flags=re.DOTALL)
if new_text == text:
    print("WARNING: Regex didn't match. Here is the block:")
    print(text[text.find('variant=contained')-100:text.find('variant=contained')+200])
else:
    with open('frontend/src/pages/OrdersPage.tsx', 'w', encoding='utf-8') as f:
        f.write(new_text)
    print("Successfully replaced Button block.")
