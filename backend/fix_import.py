import re

with open('d:\\B2B\\FLOW\\backend\\apps\\sales\\serializers.py', 'r', encoding='utf-8') as f:
    serializers_text = f.read()

# Add sync_order_prepayment_transaction to imports manually
if 'sync_order_prepayment_transaction' not in serializers_text.split('class _CompositionWriteSerializer')[0]:
    serializers_text = serializers_text.replace(
        'create_order_status_history,',
        'create_order_status_history,\n    sync_order_prepayment_transaction,'
    )

with open('d:\\B2B\\FLOW\\backend\\apps\\sales\\serializers.py', 'w', encoding='utf-8') as f:
    f.write(serializers_text)

print("Import added")