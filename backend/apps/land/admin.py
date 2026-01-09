from django.contrib import admin
from .models import LandCache


@admin.register(LandCache)
class LandCacheAdmin(admin.ModelAdmin):
    list_display = ['pnu', 'address_jibun', 'use_zone', 'parcel_area', 'updated_at']
    search_fields = ['pnu', 'address_jibun']
    list_filter = ['use_zone']
    readonly_fields = ['created_at', 'updated_at']
