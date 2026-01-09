from django.db import models


class SystemSetting(models.Model):
    """시스템 설정 (관리자용)"""
    key = models.CharField(max_length=100, primary_key=True, verbose_name='설정 키')
    value = models.TextField(verbose_name='설정 값')
    description = models.CharField(max_length=200, blank=True, verbose_name='설명')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='수정일')

    class Meta:
        db_table = 'system_setting'
        verbose_name = '시스템 설정'
        verbose_name_plural = '시스템 설정'

    def __str__(self):
        return f"{self.key}: {self.value}"

    @classmethod
    def get(cls, key: str, default: str = '') -> str:
        """설정 값 조회"""
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default

    @classmethod
    def get_bool(cls, key: str, default: bool = False) -> bool:
        """불린 설정 값 조회"""
        value = cls.get(key, str(default).lower())
        return value.lower() in ('true', '1', 'yes', 'on')

    @classmethod
    def set(cls, key: str, value: str, description: str = '') -> 'SystemSetting':
        """설정 값 저장"""
        obj, _ = cls.objects.update_or_create(
            key=key,
            defaults={'value': value, 'description': description}
        )
        return obj
