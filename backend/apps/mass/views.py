from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.core.decorators import rate_limit_free
from .models import MassStudy
from .services import MassCalculationService
from .serializers import (
    MassCalculateRequestSerializer,
    MassStudySerializer,
    GeometrySerializer,
)


class MassCalculateView(APIView):
    """매스 계산 API"""

    @rate_limit_free(limit_per_day=3, feature_name='매스계산')
    def post(self, request):
        serializer = MassCalculateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': '입력값을 확인해주세요.',
                'details': serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        pnu = data['pnu']
        building_type = data['building_type']
        target_floors = data['target_floors']
        setbacks = data.get('setbacks', {
            'front': 3.0,
            'back': 2.0,
            'left': 1.5,
            'right': 1.5,
        })

        # 매스 계산
        service = MassCalculationService(pnu)
        result = service.calculate(building_type, target_floors, setbacks)

        if not result.get('success'):
            return Response({
                'success': False,
                'error': result.get('error', 'CALCULATION_ERROR'),
                'message': result.get('message', '매스 계산에 실패했습니다.'),
            }, status=status.HTTP_400_BAD_REQUEST)

        # DB 저장
        mass = MassStudy.objects.create(
            pnu=pnu,
            building_type=building_type,
            target_floors=target_floors,
            setback_front=setbacks['front'],
            setback_back=setbacks['back'],
            setback_left=setbacks['left'],
            setback_right=setbacks['right'],
            building_area=result['building_area'],
            total_floor_area=result['total_floor_area'],
            coverage_ratio=result['coverage_ratio'],
            far_ratio=result['far_ratio'],
            height=result['height'],
            coverage_ok=result['legal_check']['coverage_ok'],
            far_ok=result['legal_check']['far_ok'],
            height_ok=result['legal_check']['height_ok'],
            setback_ok=result['legal_check']['setback_ok'],
            geometry_data=result['geometry'],
            user=request.user if request.user.is_authenticated else None,
        )

        return Response({
            'success': True,
            'data': {
                'id': mass.id,
                'pnu': pnu,
                'building_area': result['building_area'],
                'total_floor_area': result['total_floor_area'],
                'coverage_ratio': result['coverage_ratio'],
                'far_ratio': result['far_ratio'],
                'floors': result['floors'],
                'height': result['height'],
                'legal_check': result['legal_check'],
                'legal_limits': result['legal_limits'],
                'geometry_url': f'/api/v1/mass/{mass.id}/geometry/',
            }
        }, status=status.HTTP_201_CREATED)


class MassDetailView(APIView):
    """매스 상세 조회 API"""

    def get(self, request, mass_id):
        try:
            mass = MassStudy.objects.get(id=mass_id)
        except MassStudy.DoesNotExist:
            return Response({
                'success': False,
                'error': 'NOT_FOUND',
                'message': '매스 정보를 찾을 수 없습니다.',
            }, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'success': True,
            'data': MassStudySerializer(mass).data,
        })


class MassGeometryView(APIView):
    """3D 지오메트리 조회 API"""

    def get(self, request, mass_id):
        try:
            mass = MassStudy.objects.get(id=mass_id)
        except MassStudy.DoesNotExist:
            return Response({
                'success': False,
                'error': 'NOT_FOUND',
                'message': '매스 정보를 찾을 수 없습니다.',
            }, status=status.HTTP_404_NOT_FOUND)

        if not mass.geometry_data:
            return Response({
                'success': False,
                'error': 'NO_GEOMETRY',
                'message': '지오메트리 데이터가 없습니다.',
            }, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'success': True,
            'data': mass.geometry_data,
        })
