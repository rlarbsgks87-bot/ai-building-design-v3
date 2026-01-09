import uuid
from django.db import models
from django.conf import settings


class MassStudy(models.Model):
    """매스 스터디 결과"""
    id = models.CharField(max_length=50, primary_key=True, default=lambda: f"mass_{uuid.uuid4().hex[:8]}")
    pnu = models.CharField('필지번호', max_length=19)
    building_type = models.CharField('건물유형', max_length=50)

    # 입력값
    target_floors = models.IntegerField('목표 층수')
    setback_front = models.FloatField('전면 이격', default=3.0)
    setback_back = models.FloatField('후면 이격', default=2.0)
    setback_left = models.FloatField('좌측 이격', default=1.5)
    setback_right = models.FloatField('우측 이격', default=1.5)

    # 계산 결과
    building_area = models.FloatField('건축면적', null=True)
    total_floor_area = models.FloatField('연면적', null=True)
    coverage_ratio = models.FloatField('건폐율', null=True)
    far_ratio = models.FloatField('용적률', null=True)
    height = models.FloatField('높이', null=True)

    # 법규 검토
    coverage_ok = models.BooleanField('건폐율 적합', default=True)
    far_ok = models.BooleanField('용적률 적합', default=True)
    height_ok = models.BooleanField('높이 적합', default=True)
    setback_ok = models.BooleanField('이격거리 적합', default=True)

    # 3D 지오메트리
    geometry_data = models.JSONField('지오메트리 데이터', null=True)

    # 메타
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='사용자'
    )
    created_at = models.DateTimeField('생성일', auto_now_add=True)

    class Meta:
        db_table = 'mass_study'
        verbose_name = '매스 스터디'
        verbose_name_plural = '매스 스터디 목록'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.id} - {self.pnu}'
