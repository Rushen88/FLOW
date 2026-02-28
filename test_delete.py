import paramiko
import base64

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U', timeout=15)

script = """
import os, sys, django
sys.path.append('/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.sales.models import Sale
from apps.sales.services import rollback_sale_effects_before_delete
from django.db import transaction

sales = Sale.objects.all().order_by('-created_at')[:1]
if not sales:
    print("No sales to delete")
else:
    sale = sales[0]
    print(f"Trying to delete sale {sale.id} {sale.number}")
    try:
        with transaction.atomic():
            rollback_sale_effects_before_delete(sale)
            sale.delete()
            print("Success")
    except Exception as e:
        import traceback
        traceback.print_exc()
"""

# Base64 encode the script to avoid quoting issues
script_b64 = base64.b64encode(script.encode('utf-8')).decode('utf-8')
cmd = f"cd /root/FLOW && docker compose exec -T backend python -c \"import base64; exec(base64.b64decode('{script_b64}').decode('utf-8'))\""

_, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8')
err = stderr.read().decode('utf-8')

print("STDOUT:")
print(out)
print("STDERR:")
print(err)

ssh.close()
