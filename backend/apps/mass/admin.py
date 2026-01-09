from django.contrib import admin
from .models import MassStudy


@admin.register(MassStudy)
class MassStudyAdmin(admin.ModelAdmin):
    list_display = ['id', 'pnu', 'building_type', 'building_area', 'coverage_ratio', 'far_ratio', 'created_at']
    list_filter = ['building_type', 'coverage_ok', 'far_ok']
    search_fields = ['pnu', 'id']
    readonly_fields = ['id', 'created_at']
