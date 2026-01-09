import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='MassStudy',
            fields=[
                ('id', models.CharField(max_length=50, primary_key=True, serialize=False)),
                ('pnu', models.CharField(max_length=19, verbose_name='필지번호')),
                ('building_type', models.CharField(max_length=50, verbose_name='건물유형')),
                ('target_floors', models.IntegerField(verbose_name='목표 층수')),
                ('setback_front', models.FloatField(default=3.0, verbose_name='전면 이격')),
                ('setback_back', models.FloatField(default=2.0, verbose_name='후면 이격')),
                ('setback_left', models.FloatField(default=1.5, verbose_name='좌측 이격')),
                ('setback_right', models.FloatField(default=1.5, verbose_name='우측 이격')),
                ('building_area', models.FloatField(null=True, verbose_name='건축면적')),
                ('total_floor_area', models.FloatField(null=True, verbose_name='연면적')),
                ('coverage_ratio', models.FloatField(null=True, verbose_name='건폐율')),
                ('far_ratio', models.FloatField(null=True, verbose_name='용적률')),
                ('height', models.FloatField(null=True, verbose_name='높이')),
                ('coverage_ok', models.BooleanField(default=True, verbose_name='건폐율 적합')),
                ('far_ok', models.BooleanField(default=True, verbose_name='용적률 적합')),
                ('height_ok', models.BooleanField(default=True, verbose_name='높이 적합')),
                ('setback_ok', models.BooleanField(default=True, verbose_name='이격거리 적합')),
                ('geometry_data', models.JSONField(null=True, verbose_name='지오메트리 데이터')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='생성일')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, verbose_name='사용자')),
            ],
            options={
                'verbose_name': '매스 스터디',
                'verbose_name_plural': '매스 스터디 목록',
                'db_table': 'mass_study',
                'ordering': ['-created_at'],
            },
        ),
    ]
