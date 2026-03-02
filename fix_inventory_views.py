import sys

with open('backend/apps/inventory/views.py', 'r', encoding='utf-8') as f:
    text = f.read()

import_replacement = """from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
import datetime
"""
text = text.replace("from rest_framework import viewsets", import_replacement)

batch_view_target = """class BatchViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = BatchSerializer"""
    
batch_view_replacement = """class BatchViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = BatchSerializer

    @action(detail=False, methods=['get'])
    def expiring(self, request):
        \"\"\"
        Возвращает партии товаров (цветов), чей срок годности истекает 
        в течение указанного количества дней (по умолчанию 3 дня).
        \"\"\"
        days = int(request.query_params.get('days', 3))
        limit_date = timezone.now().date() + datetime.timedelta(days=days)
        
        qs = self.get_queryset().filter(
            remaining__gt=0,
            expiry_date__lte=limit_date
        ).order_by('expiry_date')
        
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
"""

text = text.replace(batch_view_target, batch_view_replacement)

with open('backend/apps/inventory/views.py', 'w', encoding='utf-8') as f:
    f.write(text)
print("Added expiring action to BatchViewSet")
