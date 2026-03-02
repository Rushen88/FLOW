import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('130.49.146.199', username='root', password='uW25mRy3cZo36GEb0U')

script = '''
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.apps import apps
from django.db import models

for app_config in apps.get_app_configs():
    if app_config.name.startswith("apps."):
        print(f"\\n--- APP: {app_config.name[-100:]} ---")
        for model in app_config.get_models():
            print(f"  Model: {model.__name__}")
            for field in model._meta.get_fields():
                field_type = type(field).__name__
                if isinstance(field, models.ForeignKey):
                    related_model = field.related_model.__name__ if field.related_model else str(field.remote_field.model)
                    print(f"    - {field.name}: {field_type} (to {related_model})")
                elif isinstance(field, models.ManyToManyField):
                    related_model = field.related_model.__name__ if field.related_model else "Unknown"
                    print(f"    - {field.name}: {field_type} (to {related_model})")
                else:
                    print(f"    - {field.name}: {field_type}")
'''

stdin, stdout, stderr = ssh.exec_command('cd /root/FLOW && docker compose exec -T backend python -c "' + script.replace('"', '\\"').replace('\\n', '\\\\n') + '"')
out = stdout.read().decode('utf-8')
with open("schema_dump.txt", "w", encoding="utf-8") as f:
    f.write(out)
print("Done!")
