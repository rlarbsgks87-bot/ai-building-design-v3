from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'username', 'is_premium', 'is_staff', 'created_at']
    list_filter = ['is_premium', 'is_staff', 'is_active']
    search_fields = ['email', 'username', 'company']
    ordering = ['-created_at']

    fieldsets = BaseUserAdmin.fieldsets + (
        ('추가 정보', {'fields': ('phone', 'company', 'is_premium')}),
    )
