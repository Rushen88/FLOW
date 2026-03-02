import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.apps import apps
from django.db import models

for app_config in apps.get_app_configs():
    if app_config.name.startswith('apps.'):
        print(f"\n--- APP: {app_config.name} ---")
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
