from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.db.models import Sum, Count, Q
from django.utils import timezone
from .models import (
    Organization, User, TradingPoint, Warehouse, PaymentMethod,
    TenantContact, TenantPayment, TenantNote,
)
from .serializers import (
    OrganizationSerializer, OrganizationAdminSerializer,
    UserSerializer, UserCreateSerializer,
    TradingPointSerializer, WarehouseSerializer, PaymentMethodSerializer,
    TenantContactSerializer, TenantPaymentSerializer, TenantNoteSerializer,
    PlatformAdminSerializer, PlatformAdminCreateSerializer,
)
from .mixins import (
    OrgPerformCreateMixin, IsPlatformAdmin, IsOwnerOrAdmin,
    _tenant_filter, _resolve_org,
)


class OrganizationViewSet(viewsets.ModelViewSet):
    """
    CRUD организаций.
    - Суперадмин: видит все, полный CRUD, расширенный сериализатор.
    - Owner/admin: видит только свою, может редактировать.
    - Остальные: только чтение своей.
    """
    queryset = Organization.objects.all()

    def get_serializer_class(self):
        if self.request.user.is_superuser:
            return OrganizationAdminSerializer
        return OrganizationSerializer

    def get_permissions(self):
        if self.action in ('create', 'destroy'):
            # Создание новых тенантов — суперадмин или пользователь без орги
            if self.action == 'create' and not self.request.user.is_superuser:
                return [permissions.IsAuthenticated()]
            return [permissions.IsAuthenticated(), IsPlatformAdmin()]
        if self.action in ('update', 'partial_update'):
            return [permissions.IsAuthenticated(), IsOwnerOrAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Organization.objects.all().order_by('-created_at')
        if user.organization:
            return Organization.objects.filter(id=user.organization_id)
        return Organization.objects.none()

    def perform_create(self, serializer):
        """Создание организации — автопривязка текущего пользователя."""
        org = serializer.save()
        user = self.request.user
        if not user.is_superuser and not user.organization:
            user.organization = org
            if user.role not in ('owner', 'admin'):
                user.role = 'owner'
            user.save(update_fields=['organization', 'role'])
        # Суперадмин — автовыбор active_organization
        if user.is_superuser and not user.active_organization:
            user.active_organization = org
            user.save(update_fields=['active_organization'])

    @action(detail=False, methods=['get'], url_path='tenant-metrics')
    def tenant_metrics(self, request):
        """Агрегированные метрики по всем тенантам (для дашборда админа)."""
        if not request.user.is_superuser:
            return Response(
                {'detail': 'Только для суперадминов.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        from apps.sales.models import Sale

        today = timezone.now().date()
        month_start = today.replace(day=1)

        orgs = Organization.objects.annotate(
            users_count=Count('users'),
            total_revenue=Sum(
                'sales__total',
                filter=Q(sales__status='completed'),
            ),
            month_revenue=Sum(
                'sales__total',
                filter=Q(
                    sales__status='completed',
                    sales__created_at__date__gte=month_start,
                ),
            ),
            total_sales=Count(
                'sales',
                filter=Q(sales__status='completed'),
            ),
        ).order_by('-created_at')

        data = []
        total_revenue_all = 0
        total_month_all = 0
        for org in orgs:
            rev = float(org.total_revenue or 0)
            mrev = float(org.month_revenue or 0)
            total_revenue_all += rev
            total_month_all += mrev
            data.append({
                'id': str(org.id),
                'name': org.name,
                'subscription_plan': org.subscription_plan,
                'is_active': org.is_active,
                'users_count': org.users_count,
                'total_revenue': rev,
                'month_revenue': mrev,
                'total_sales': org.total_sales or 0,
                'paid_until': str(org.paid_until) if org.paid_until else None,
                'monthly_price': float(org.monthly_price),
            })

        # Общие платежи тенантов
        total_payments = TenantPayment.objects.aggregate(
            total=Sum('amount')
        )['total'] or 0

        return Response({
            'tenants': data,
            'summary': {
                'total_tenants': len(data),
                'active_tenants': sum(1 for d in data if d['is_active']),
                'total_users': sum(d['users_count'] for d in data),
                'total_revenue': total_revenue_all,
                'month_revenue': total_month_all,
                'total_payments': float(total_payments),
            },
        })


class UserViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = UserSerializer
    queryset = User.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        qs = User.objects.select_related('organization')
        user = self.request.user
        org = _resolve_org(user)
        if org:
            return qs.filter(organization=org)
        if user.is_superuser:
            return qs  # видит всех (когда active_org не выбрана)
        return qs.none()

    def get_permissions(self):
        if self.action in ('me', 'update_me', 'change_my_password', 'set_active_org'):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsOwnerOrAdmin()]

    def perform_create(self, serializer):
        """Создание пользователя — проверка лимита max_users."""
        org = _resolve_org(self.request.user)
        if not org:
            raise ValidationError(
                {'organization': 'Сначала выберите организацию.'},
                code='no_organization',
            )
        current_count = User.objects.filter(organization=org).count()
        if current_count >= org.max_users:
            raise ValidationError(
                {'detail': f'Достигнут лимит пользователей ({org.max_users}). '
                           f'Обратитесь к администратору для увеличения лимита.'},
                code='max_users_exceeded',
            )
        serializer.save(organization=org)

    @action(detail=False, methods=['get', 'patch'], url_path='me')
    def me(self, request):
        """Получение / обновление профиля текущего пользователя."""
        if request.method == 'PATCH':
            serializer = self.get_serializer(
                request.user, data=request.data, partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='me/change-password')
    def change_my_password(self, request):
        """Смена собственного пароля (любой аутентифицированный пользователь)."""
        old_password = request.data.get('old_password', '')
        new_password = request.data.get('new_password', '')
        if not request.user.check_password(old_password):
            raise ValidationError({'old_password': 'Неверный текущий пароль.'})
        if len(new_password) < 8:
            raise ValidationError({'new_password': 'Пароль должен содержать минимум 8 символов.'})
        request.user.set_password(new_password)
        request.user.save(update_fields=['password'])
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        """Смена пароля пользователя (owner/admin)."""
        target_user = self.get_object()
        password = request.data.get('password', '')
        if len(password) < 8:
            raise ValidationError({'password': 'Минимум 8 символов.'})
        target_user.set_password(password)
        target_user.save(update_fields=['password'])
        return Response({'status': 'ok'})

    @action(detail=False, methods=['post'], url_path='me/set-active-org')
    def set_active_org(self, request):
        """
        Суперадмин выбирает «рабочую» организацию.
        POST { "organization": "<uuid>" }   — устанавливает
        POST { "organization": null }       — сбрасывает (видит всё)
        """
        if not request.user.is_superuser:
            return Response(
                {'detail': 'Только суперадмин может переключать организацию.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        org_id = request.data.get('organization')
        if org_id:
            try:
                org = Organization.objects.get(pk=org_id)
            except Organization.DoesNotExist:
                raise ValidationError({'organization': 'Организация не найдена.'})
            request.user.active_organization = org
        else:
            request.user.active_organization = None
        request.user.save(update_fields=['active_organization'])
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)


class TradingPointViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = TradingPointSerializer
    queryset = TradingPoint.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        qs = TradingPoint.objects.select_related('organization', 'manager')
        return _tenant_filter(qs, self.request.user)


class WarehouseViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = WarehouseSerializer
    queryset = Warehouse.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        qs = Warehouse.objects.select_related('organization', 'trading_point')
        qs = _tenant_filter(qs, self.request.user)
        tp = self.request.query_params.get('trading_point')
        if tp:
            qs = qs.filter(trading_point_id=tp)
        return qs


class PaymentMethodViewSet(OrgPerformCreateMixin, viewsets.ModelViewSet):
    serializer_class = PaymentMethodSerializer
    queryset = PaymentMethod.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        qs = PaymentMethod.objects.all()
        return _tenant_filter(qs, self.request.user)


# ═══════════════════════════════════════════════════════════════
# Platform administration ViewSets (superuser only)
# ═══════════════════════════════════════════════════════════════


class TenantContactViewSet(viewsets.ModelViewSet):
    """Контактные лица тенантов. Только для суперадминов."""
    serializer_class = TenantContactSerializer
    queryset = TenantContact.objects.select_related('organization')
    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]

    def get_queryset(self):
        qs = TenantContact.objects.select_related('organization')
        org_id = self.request.query_params.get('organization')
        if org_id:
            qs = qs.filter(organization_id=org_id)
        return qs


class TenantPaymentViewSet(viewsets.ModelViewSet):
    """История оплат тенантов. Только для суперадминов."""
    serializer_class = TenantPaymentSerializer
    queryset = TenantPayment.objects.select_related('organization', 'created_by')
    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]

    def get_queryset(self):
        qs = TenantPayment.objects.select_related('organization', 'created_by')
        org_id = self.request.query_params.get('organization')
        if org_id:
            qs = qs.filter(organization_id=org_id)
        return qs

    def perform_create(self, serializer):
        org_id = serializer.validated_data.get('organization')
        if org_id:
            # Автообновление paid_until на организации
            period_to = serializer.validated_data.get('period_to')
            if period_to:
                org = org_id if isinstance(org_id, Organization) else Organization.objects.get(pk=org_id)
                if not org.paid_until or period_to > org.paid_until:
                    org.paid_until = period_to
                    org.save(update_fields=['paid_until'])
        serializer.save(created_by=self.request.user)


class TenantNoteViewSet(viewsets.ModelViewSet):
    """Журнал взаимодействий с тенантами. Только для суперадминов."""
    serializer_class = TenantNoteSerializer
    queryset = TenantNote.objects.select_related('organization', 'created_by')
    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]

    def get_queryset(self):
        qs = TenantNote.objects.select_related('organization', 'created_by')
        org_id = self.request.query_params.get('organization')
        if org_id:
            qs = qs.filter(organization_id=org_id)
        note_type = self.request.query_params.get('note_type')
        if note_type:
            qs = qs.filter(note_type=note_type)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class PlatformAdminViewSet(viewsets.ModelViewSet):
    """
    Управление администраторами платформы (superusers).
    Только для суперадминов.
    """
    serializer_class = PlatformAdminSerializer
    queryset = User.objects.filter(is_superuser=True)
    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]

    def get_serializer_class(self):
        if self.action == 'create':
            return PlatformAdminCreateSerializer
        return PlatformAdminSerializer

    def get_queryset(self):
        return User.objects.filter(is_superuser=True).order_by('-date_joined')

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        """Смена пароля администратора."""
        target = self.get_object()
        password = request.data.get('password', '')
        if len(password) < 8:
            raise ValidationError({'password': 'Минимум 8 символов.'})
        target.set_password(password)
        target.save(update_fields=['password'])
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        """Активация/деактивация администратора."""
        target = self.get_object()
        if target == request.user:
            raise ValidationError({'detail': 'Нельзя деактивировать себя.'})
        target.is_active = not target.is_active
        target.save(update_fields=['is_active'])
        return Response(PlatformAdminSerializer(target).data)
