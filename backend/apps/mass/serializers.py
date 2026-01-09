from rest_framework import serializers
from .models import MassStudy


class SetbacksSerializer(serializers.Serializer):
    front = serializers.FloatField(default=3.0, min_value=0)
    back = serializers.FloatField(default=2.0, min_value=0)
    left = serializers.FloatField(default=1.5, min_value=0)
    right = serializers.FloatField(default=1.5, min_value=0)


class MassCalculateRequestSerializer(serializers.Serializer):
    pnu = serializers.CharField(max_length=19)
    building_type = serializers.CharField(max_length=50, default='apartment')
    target_floors = serializers.IntegerField(min_value=1, max_value=50)
    setbacks = SetbacksSerializer(required=False)

    def validate_setbacks(self, value):
        if value is None:
            return {
                'front': 3.0,
                'back': 2.0,
                'left': 1.5,
                'right': 1.5,
            }
        return value


class LegalCheckSerializer(serializers.Serializer):
    coverage_ok = serializers.BooleanField()
    far_ok = serializers.BooleanField()
    height_ok = serializers.BooleanField()
    setback_ok = serializers.BooleanField()


class MassCalculateResponseSerializer(serializers.Serializer):
    id = serializers.CharField()
    pnu = serializers.CharField()
    building_area = serializers.FloatField()
    total_floor_area = serializers.FloatField()
    coverage_ratio = serializers.FloatField()
    far_ratio = serializers.FloatField()
    floors = serializers.IntegerField()
    height = serializers.FloatField()
    legal_check = LegalCheckSerializer()
    geometry_url = serializers.CharField()


class MassStudySerializer(serializers.ModelSerializer):
    class Meta:
        model = MassStudy
        fields = [
            'id', 'pnu', 'building_type', 'target_floors',
            'setback_front', 'setback_back', 'setback_left', 'setback_right',
            'building_area', 'total_floor_area', 'coverage_ratio', 'far_ratio',
            'height', 'coverage_ok', 'far_ok', 'height_ok', 'setback_ok',
            'created_at',
        ]


class GeometrySerializer(serializers.Serializer):
    type = serializers.CharField()
    format = serializers.CharField()
    dimensions = serializers.DictField()
    position = serializers.DictField()
    land = serializers.DictField()
