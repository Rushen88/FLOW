"""
Переиспользуемые миксины для мультитенантной изоляции и RBAC.

В системе два уровня контекста:
1. Организация (тенант) — обязательная изоляция данных
2. Торговая точка — опциональная фильтрация внутри тенанта

Суперадмин может выбирать оба уровня через active_organization / active_trading_point.
Owner / admin могут выбирать торговую точку через active_trading_point.
Seller / courier привязаны к конкретной торговой точке через user.trading_point.
"""
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, BasePermission


# ─── Permissions ───────────────────────────────────────────────

class IsPlatformAdmin(BasePermission):
    """Только суперадмин платформы."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class IsOwnerOrAdmin(BasePermission):
    """Только owner / admin организации (или суперадмин)."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ('owner', 'admin')


class IsManager(BasePermission):
    """Owner / admin / manager (или суперадмин)."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ('owner', 'admin', 'manager')


class ReadOnlyOrManager(BasePermission):
    """Чтение — все, запись — manager+ (или суперадмин)."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        if request.user.is_superuser:
            return True
        return request.user.role in ('owner', 'admin', 'manager')


# ─── Tenant helpers ───────────────────────────────────────────

def _resolve_org(user):
    """
    Вернуть «рабочую» организацию пользователя.
    Для суперадмина — active_organization (выбранный тенант).
    Для обычного пользователя — organization.
    """
    if user.is_superuser:
        return getattr(user, 'active_organization', None)
    return getattr(user, 'organization', None)


def _resolve_tp(user):
    """
    Вернуть «рабочую» торговую точку пользователя.

    Приоритет:
    1. active_trading_point (явный выбор в UI) — для SA, owner, admin
    2. user.trading_point — закреплённая ТТ (для seller, courier)
    3. None — «все точки» (допустимо для owner/admin/SA без выбора)
    """
    # Явный выбор
    tp = getattr(user, 'active_trading_point', None)
    if tp:
        return tp
    # Закреплённая торговая точка сотрудника
    return getattr(user, 'trading_point', None)


def _tenant_filter(qs, user, org_field='organization', tp_field=None):
    """
    Фильтр по тенанту (организация + опционально торговая точка).

    Параметры:
    - org_field: имя FK на Organization в модели (напр. 'organization', 'sale__organization')
    - tp_field:  имя FK на TradingPoint в модели (напр. 'trading_point', None).
                 Если None — фильтрация по ТТ не применяется.

    Логика:
    - Есть организация (или active_org для суперадмина) → фильтр по org.
    - Суперадмин без active_org → видит всё.
    - Обычный пользователь без org → qs.none().
    - Если tp_field задан и у пользователя есть «рабочая» ТТ → дополнительный фильтр.
    """
    org = _resolve_org(user)
    if org:
        qs = qs.filter(**{org_field: org})
    elif user.is_superuser:
        pass  # суперадмин без выбранного тенанта — видит всё
    else:
        return qs.none()

    # Фильтр по торговой точке
    if tp_field:
        tp = _resolve_tp(user)
        if tp:
            qs = qs.filter(**{tp_field: tp})

    return qs


# ─── Mixins ───────────────────────────────────────────────────

class OrgPerformCreateMixin:
    """
    Автоматически устанавливает organization (и опционально trading_point)
    при создании и защищает от подмены при обновлении.
    """

    def perform_create(self, serializer):
        org = _resolve_org(self.request.user)
        if not org:
            raise ValidationError(
                {'organization': 'Сначала выберите организацию.'},
                code='no_organization',
            )
        # Если модель имеет FK trading_point и он не был передан,
        # подставляем рабочую ТТ пользователя.
        extra = {'organization': org}
        model = serializer.Meta.model
        if hasattr(model, 'trading_point') and hasattr(model, 'trading_point_id'):
            tp_val = serializer.validated_data.get('trading_point')
            if not tp_val:
                tp = _resolve_tp(self.request.user)
                if tp:
                    extra['trading_point'] = tp
        serializer.save(**extra)

    def perform_update(self, serializer):
        # При обновлении НЕ перезаписываем organization —
        # запись должна оставаться в своём тенанте.
        org = _resolve_org(self.request.user)
        if not org:
            raise ValidationError(
                {'organization': 'Сначала выберите организацию.'},
                code='no_organization',
            )
        # Проверяем что обновляемый объект принадлежит текущей организации
        instance = serializer.instance
        if hasattr(instance, 'organization_id') and instance.organization_id != org.id:
            raise ValidationError(
                {'organization': 'Нельзя редактировать записи другой организации.'},
                code='wrong_organization',
            )
        serializer.save()
