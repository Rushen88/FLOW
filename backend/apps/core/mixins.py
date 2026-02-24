"""
Переиспользуемые миксины для мультитенантной изоляции и RBAC.
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


def _tenant_filter(qs, user, org_field='organization'):
    """
    Фильтр по тенанту.
    - Есть организация (или active_org для суперадмина) → фильтр.
    - Суперадмин без active_org → видит всё.
    - Обычный пользователь без org → qs.none().
    """
    org = _resolve_org(user)
    if org:
        return qs.filter(**{org_field: org})
    if user.is_superuser:
        return qs          # суперадмин без выбранного тенанта — всё
    return qs.none()


# ─── Mixins ───────────────────────────────────────────────────

class OrgPerformCreateMixin:
    """
    Автоматически устанавливает organization из request.user при создании
    и защищает от подмены при обновлении.
    """

    def perform_create(self, serializer):
        org = _resolve_org(self.request.user)
        if not org:
            raise ValidationError(
                {'organization': 'Сначала выберите организацию.'},
                code='no_organization',
            )
        serializer.save(organization=org)

    def perform_update(self, serializer):
        org = _resolve_org(self.request.user)
        if not org:
            raise ValidationError(
                {'organization': 'Сначала выберите организацию.'},
                code='no_organization',
            )
        serializer.save(organization=org)
