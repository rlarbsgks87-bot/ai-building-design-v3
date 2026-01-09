from rest_framework import serializers


class AddressSearchSerializer(serializers.Serializer):
    q = serializers.CharField(max_length=200)


class GeocodeSerializer(serializers.Serializer):
    address = serializers.CharField(max_length=200)


class PointQuerySerializer(serializers.Serializer):
    x = serializers.FloatField()
    y = serializers.FloatField()


class LandDetailSerializer(serializers.Serializer):
    pnu = serializers.CharField(max_length=19)
    address_jibun = serializers.CharField()
    address_road = serializers.CharField(allow_blank=True)
    parcel_area = serializers.FloatField(allow_null=True)
    use_zone = serializers.CharField(allow_blank=True)
    legal_bc_ratio = serializers.IntegerField(required=False)
    legal_far_ratio = serializers.IntegerField(required=False)
    official_land_price = serializers.IntegerField(allow_null=True)
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()


class RegulationSerializer(serializers.Serializer):
    pnu = serializers.CharField()
    address = serializers.CharField()
    parcel_area = serializers.FloatField()
    use_zone = serializers.CharField()
    coverage = serializers.IntegerField()
    far = serializers.IntegerField()
    height_limit = serializers.CharField(allow_null=True)
    north_setback = serializers.FloatField()
    note = serializers.CharField(allow_null=True)
    max_building_area = serializers.FloatField()
    max_floor_area = serializers.FloatField()
