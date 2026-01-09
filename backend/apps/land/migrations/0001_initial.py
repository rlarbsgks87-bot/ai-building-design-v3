from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='LandCache',
            fields=[
                ('pnu', models.CharField(max_length=19, primary_key=True, serialize=False, verbose_name='필지고유번호')),
                ('address_jibun', models.CharField(max_length=200, verbose_name='지번주소')),
                ('address_road', models.CharField(blank=True, max_length=200, verbose_name='도로명주소')),
                ('parcel_area', models.FloatField(null=True, verbose_name='대지면적')),
                ('use_zone', models.CharField(blank=True, max_length=50, verbose_name='용도지역')),
                ('official_land_price', models.IntegerField(null=True, verbose_name='공시지가')),
                ('latitude', models.FloatField(null=True, verbose_name='위도')),
                ('longitude', models.FloatField(null=True, verbose_name='경도')),
                ('geometry', models.JSONField(null=True, verbose_name='지오메트리')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='생성일')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='수정일')),
            ],
            options={
                'verbose_name': '토지 캐시',
                'verbose_name_plural': '토지 캐시 목록',
                'db_table': 'land_cache',
            },
        ),
    ]
