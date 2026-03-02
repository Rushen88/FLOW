import sys
import re

with open('backend/apps/inventory/views.py', 'r', encoding='utf-8') as f:
    text = f.read()

# We need to strip out all the messed up imports and replace with a clean one block
# I'll just write a script to re-write the top level imports since they are pretty standard
clean_imports = '''from decimal import Decimal
from django.db import transaction as db_transaction
from django.db.models import Q
from django.utils import timezone
import datetime

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Batch, StockBalance, StockMovement, InventoryDocument, Reserve
from .serializers import (
    BatchSerializer, StockBalanceSerializer, StockMovementSerializer,
    InventoryDocumentSerializer, ReserveSerializer,
)
from .services import (
    process_batch_receipt, assemble_bouquet, disassemble_bouquet,
    write_off_stock, transfer_stock, InsufficientStockError, build_stock_summary, correct_bouquet_stock,
)
from apps.core.mixins import OrgPerformCreateMixin, _tenant_filter

'''

# find the first occurrence of "class " and replace everything before it with clean imports
idx = text.find("class BatchViewSet")
if idx != -1:
    text = clean_imports + text[idx:]
    with open('backend/apps/inventory/views.py', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Fixed imports")
