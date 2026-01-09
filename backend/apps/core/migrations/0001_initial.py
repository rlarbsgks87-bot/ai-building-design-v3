from django.db import migrations, models


def create_initial_settings(apps, schema_editor):
    """초기 시스템 설정 생성"""
    SystemSetting = apps.get_model('core', 'SystemSetting')
    SystemSetting.objects.create(
        key='DISABLE_RATE_LIMIT',
        value='true',
        description='Rate Limit 비활성화 여부 (테스트용 true)'
    )


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='SystemSetting',
            fields=[
                ('key', models.CharField(max_length=100, primary_key=True, serialize=False, verbose_name='설정 키')),
                ('value', models.TextField(verbose_name='설정 값')),
                ('description', models.CharField(blank=True, max_length=200, verbose_name='설명')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='수정일')),
            ],
            options={
                'verbose_name': '시스템 설정',
                'verbose_name_plural': '시스템 설정',
                'db_table': 'system_setting',
            },
        ),
        migrations.RunPython(create_initial_settings),
    ]
