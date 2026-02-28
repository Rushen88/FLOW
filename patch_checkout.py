import os
with open('backend/apps/sales/views.py', 'r', encoding='utf-8') as f:
    content = f.read()
inject = '''
    @action(detail=True, methods=['post'], url_path='checkout')
    def checkout(self, request, pk=None):
        from rest_framework.response import Response
        from apps.finance.models import CashShift
        from apps.sales.models import Sale, SaleItem
        from apps.sales.services import process_completed_sale
        order = self.get_object()
        if hasattr(order, 'sales') and order.sales.exists():
            return Response({'detail': 'Чек по этому заказу уже существует.'}, status=status.HTTP_400_BAD_REQUEST)
        active_shift = CashShift.objects.filter(
            trading_point=order.trading_point,
            closed_at__isnull=True
        ).last()
        sale = Sale.objects.create(
            organization=order.organization,
            trading_point=order.trading_point,
            status=Sale.Status.COMPLETED,
            customer=order.customer,
            seller=request.user,
            order=order,
            subtotal=order.subtotal,
            discount_amount=order.discount_amount,
            total=order.total - order.prepayment,
            payment_method=order.payment_method,
            cash_shift=active_shift,
            is_paid=True
        )
        for item in order.items.all():
            SaleItem.objects.create(
                sale=sale,
                nomenclature=item.nomenclature,
                quantity=item.quantity,
                price=item.price,
                discount_percent=item.discount_percent,
                total=item.total,
                is_custom_bouquet=item.is_custom_bouquet
            )
        process_completed_sale(sale, request.user)
        order.status = 'completed'
        order.save(update_fields=['status'])
        return Response({'detail': 'Продажа успешно создана', 'sale_id': sale.id}, status=status.HTTP_201_CREATED)
'''
content = content.replace('def get_serializer_class(self):', inject + '\n    def get_serializer_class(self):')
if 'from rest_framework.decorators import action' not in content:
    content = content.replace('from rest_framework import viewsets, filters, status', 'from rest_framework import viewsets, filters, status\nfrom rest_framework.decorators import action')
with open('backend/apps/sales/views.py', 'w', encoding='utf-8') as f:
    f.write(content)
