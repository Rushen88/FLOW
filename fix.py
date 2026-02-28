import re
text = open("frontend/src/pages/OrdersPage.tsx", encoding="utf-8").read()
text = text.replace("disabled={statusChanging ; checkoutLoading}", "disabled={statusChanging || checkoutLoading}")
text = re.sub(r"display:\s*.*?flex.*?,", "display: \"flex\",", text)
text = re.sub(r"justifyContent:\s*.*?flex-end.*?,", "justifyContent: \"flex-end\",", text)
open("frontend/src/pages/OrdersPage.tsx", "w", encoding="utf-8").write(text)

