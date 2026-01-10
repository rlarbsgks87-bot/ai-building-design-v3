from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.http import HttpResponse
import requests
from django.conf import settings

from apps.core.decorators import rate_limit_free
from .services import LandService, VWorldService
from .serializers import AddressSearchSerializer, GeocodeSerializer, PointQuerySerializer


class AddressSearchView(APIView):
    """주소 검색 API"""

    @rate_limit_free(limit_per_day=5, feature_name='주소검색')
    def get(self, request):
        serializer = AddressSearchSerializer(data=request.query_params)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': '검색어를 입력해주세요.',
            }, status=status.HTTP_400_BAD_REQUEST)

        query = serializer.validated_data['q']
        vworld = VWorldService()
        result = vworld.search_address(query)

        return Response(result)


class GeocodeView(APIView):
    """주소 → 좌표 변환 API"""

    def post(self, request):
        serializer = GeocodeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': '주소를 입력해주세요.',
            }, status=status.HTTP_400_BAD_REQUEST)

        address = serializer.validated_data['address']
        vworld = VWorldService()
        result = vworld.geocode(address)

        if result.get('success'):
            return Response({
                'success': True,
                'data': result,
            })

        return Response({
            'success': False,
            'error': 'NOT_FOUND',
            'message': '좌표를 찾을 수 없습니다.',
        }, status=status.HTTP_404_NOT_FOUND)


class LandDetailView(APIView):
    """토지 상세 정보 API"""

    @rate_limit_free(limit_per_day=10, feature_name='토지조회')
    def get(self, request, pnu):
        x = request.query_params.get('x')
        y = request.query_params.get('y')

        x = float(x) if x else None
        y = float(y) if y else None

        service = LandService()
        result = service.get_land_detail(pnu, x, y)

        if result.get('success'):
            return Response(result)

        return Response({
            'success': False,
            'error': 'NOT_FOUND',
            'message': '토지 정보를 찾을 수 없습니다.',
        }, status=status.HTTP_404_NOT_FOUND)


class LandRegulationView(APIView):
    """법규 검토 API"""

    def get(self, request, pnu):
        service = LandService()
        result = service.get_regulation(pnu)

        if result.get('success'):
            return Response(result)

        return Response({
            'success': False,
            'error': 'NOT_FOUND',
            'message': '토지 정보를 찾을 수 없습니다.',
        }, status=status.HTTP_404_NOT_FOUND)


class ParcelByPointView(APIView):
    """좌표로 필지 조회 API"""

    @rate_limit_free(limit_per_day=10, feature_name='필지클릭')
    def post(self, request):
        serializer = PointQuerySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': '좌표를 입력해주세요.',
            }, status=status.HTTP_400_BAD_REQUEST)

        x = serializer.validated_data['x']
        y = serializer.validated_data['y']

        vworld = VWorldService()
        result = vworld.get_parcel_by_point(x, y)

        if result.get('success'):
            return Response(result)

        return Response({
            'success': False,
            'error': 'NOT_FOUND',
            'message': result.get('error', '해당 좌표에 필지 정보가 없습니다.'),
        }, status=status.HTTP_404_NOT_FOUND)


class VWorldWMSProxyView(APIView):
    """VWorld WMS 프록시"""

    def get(self, request):
        params = request.GET.dict()
        params['key'] = settings.VWORLD_API_KEY

        try:
            response = requests.get(
                'https://api.vworld.kr/req/wms',
                params=params,
                timeout=30
            )
            return HttpResponse(
                response.content,
                content_type=response.headers.get('Content-Type', 'image/png')
            )
        except requests.RequestException:
            return Response({
                'success': False,
                'error': 'EXTERNAL_API_ERROR',
            }, status=status.HTTP_502_BAD_GATEWAY)


class VWorldWFSProxyView(APIView):
    """VWorld WFS 프록시"""

    def get(self, request):
        params = request.GET.dict()
        params['key'] = settings.VWORLD_API_KEY
        params['OUTPUT'] = 'application/json'

        try:
            response = requests.get(
                'https://api.vworld.kr/req/wfs',
                params=params,
                timeout=30
            )
            return Response(response.json())
        except requests.RequestException:
            return Response({
                'success': False,
                'error': 'EXTERNAL_API_ERROR',
            }, status=status.HTTP_502_BAD_GATEWAY)


class LandGeometryView(APIView):
    """필지 지오메트리 조회 API (VWorld 연속지적도)"""

    def get(self, request, pnu):
        vworld = VWorldService()
        result = vworld.get_parcel_geometry(pnu)

        if result.get('success'):
            return Response(result)

        return Response({
            'success': False,
            'error': 'NOT_FOUND',
            'message': result.get('error', '필지 지오메트리를 찾을 수 없습니다.'),
        }, status=status.HTTP_404_NOT_FOUND)


class AdjacentRoadsView(APIView):
    """인접 도로 지오메트리 조회 API (VWorld 연속지적도 - 지목이 '도'인 필지)"""

    def get(self, request, pnu):
        vworld = VWorldService()
        result = vworld.get_adjacent_roads(pnu)

        if result.get('success'):
            return Response(result)

        return Response({
            'success': False,
            'error': 'NOT_FOUND',
            'message': result.get('error', '인접 도로를 찾을 수 없습니다.'),
        }, status=status.HTTP_404_NOT_FOUND)


class BuildingFootprintsView(APIView):
    """주변 건물 footprint 조회 API (VWorld 건축물정보 레이어)"""

    def get(self, request, pnu):
        vworld = VWorldService()

        # 필지 지오메트리로 bbox 가져오기
        parcel_geom = vworld.get_parcel_geometry(pnu)
        if not parcel_geom.get('success'):
            return Response({
                'success': False,
                'error': 'NOT_FOUND',
                'message': '필지 지오메트리를 찾을 수 없습니다.',
            }, status=status.HTTP_404_NOT_FOUND)

        bbox = parcel_geom.get('bbox')
        if not bbox:
            return Response({
                'success': False,
                'error': 'INVALID_GEOMETRY',
                'message': '유효한 bbox가 없습니다.',
            }, status=status.HTTP_400_BAD_REQUEST)

        # bbox 확장 (약 50m 버퍼)
        buffer = 0.0005  # 약 50m
        expanded_bbox = {
            'minX': bbox['minX'] - buffer,
            'minY': bbox['minY'] - buffer,
            'maxX': bbox['maxX'] + buffer,
            'maxY': bbox['maxY'] + buffer,
        }

        result = vworld.get_building_footprints(expanded_bbox, target_pnu=pnu)

        if result.get('success'):
            return Response(result)

        return Response({
            'success': False,
            'error': 'NOT_FOUND',
            'message': result.get('error', '건물 정보를 찾을 수 없습니다.'),
        }, status=status.HTTP_404_NOT_FOUND)


class LandAnalysisView(APIView):
    """주소 기반 토지 분석 API (Lambda 프록시 사용)

    원본 ai-building-design 프로젝트의 /api/analyze 패턴 구현
    """

    @rate_limit_free(limit_per_day=10, feature_name='토지분석')
    def post(self, request):
        address = request.data.get('address')

        if not address:
            return Response({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': '주소를 입력해주세요.',
            }, status=status.HTTP_400_BAD_REQUEST)

        service = LandService()
        result = service.get_land_analysis(address)

        if result.get('success'):
            return Response(result)

        return Response({
            'success': False,
            'error': 'ANALYSIS_FAILED',
            'message': result.get('error', '토지 분석에 실패했습니다.'),
        }, status=status.HTTP_400_BAD_REQUEST)
