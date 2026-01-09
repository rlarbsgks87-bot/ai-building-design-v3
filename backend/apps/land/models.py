from django.db import models


class LandCache(models.Model):
    """토지 정보 캐시"""
    pnu = models.CharField('필지고유번호', max_length=19, primary_key=True)
    address_jibun = models.CharField('지번주소', max_length=200)
    address_road = models.CharField('도로명주소', max_length=200, blank=True)
    parcel_area = models.FloatField('대지면적', null=True)
    use_zone = models.CharField('용도지역', max_length=50, blank=True)
    official_land_price = models.IntegerField('공시지가', null=True)
    latitude = models.FloatField('위도', null=True)
    longitude = models.FloatField('경도', null=True)
    geometry = models.JSONField('지오메트리', null=True)
    created_at = models.DateTimeField('생성일', auto_now_add=True)
    updated_at = models.DateTimeField('수정일', auto_now=True)

    class Meta:
        db_table = 'land_cache'
        verbose_name = '토지 캐시'
        verbose_name_plural = '토지 캐시 목록'

    def __str__(self):
        return f'{self.pnu} - {self.address_jibun}'
