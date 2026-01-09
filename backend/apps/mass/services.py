import math
from apps.core.constants import get_building_limits, calculate_north_setback, DEFAULT_FLOOR_HEIGHT
from apps.land.models import LandCache


class MassCalculationService:
    """매스 계산 서비스"""

    def __init__(self, pnu: str):
        self.pnu = pnu
        self.land = self._get_land()

    def _get_land(self):
        try:
            return LandCache.objects.get(pnu=self.pnu)
        except LandCache.DoesNotExist:
            return None

    def calculate(
        self,
        building_type: str,
        target_floors: int,
        setbacks: dict
    ) -> dict:
        """매스 계산 실행"""
        if not self.land:
            return {'success': False, 'error': 'LAND_NOT_FOUND'}

        # 대지면적 (임시로 100평 = 330㎡ 가정, 실제는 geometry에서 계산)
        parcel_area = self.land.parcel_area or 500.0
        use_zone = self.land.use_zone or '제2종일반주거지역'

        # 법규 기준 조회
        limits = get_building_limits(use_zone)
        legal_coverage = limits['coverage']
        legal_far = limits['far']

        # 이격거리 적용 후 건축 가능 면적 계산
        # 단순화: 정사각형 대지 가정
        side_length = math.sqrt(parcel_area)
        buildable_width = side_length - setbacks['left'] - setbacks['right']
        buildable_depth = side_length - setbacks['front'] - setbacks['back']

        if buildable_width <= 0 or buildable_depth <= 0:
            return {
                'success': False,
                'error': 'INVALID_SETBACKS',
                'message': '이격거리가 너무 커서 건축 가능 면적이 없습니다.',
            }

        # 건축면적
        building_area = buildable_width * buildable_depth

        # 건폐율 검토
        coverage_ratio = (building_area / parcel_area) * 100
        coverage_ok = coverage_ratio <= legal_coverage

        # 건폐율 초과 시 조정
        if not coverage_ok:
            max_building_area = parcel_area * legal_coverage / 100
            scale_factor = math.sqrt(max_building_area / building_area)
            buildable_width *= scale_factor
            buildable_depth *= scale_factor
            building_area = buildable_width * buildable_depth
            coverage_ratio = legal_coverage
            coverage_ok = True

        # 연면적
        total_floor_area = building_area * target_floors

        # 용적률 검토
        far_ratio = (total_floor_area / parcel_area) * 100
        far_ok = far_ratio <= legal_far

        # 용적률 초과 시 층수 조정
        actual_floors = target_floors
        if not far_ok:
            max_floor_area = parcel_area * legal_far / 100
            actual_floors = int(max_floor_area / building_area)
            total_floor_area = building_area * actual_floors
            far_ratio = (total_floor_area / parcel_area) * 100
            far_ok = True

        # 높이 계산
        height = actual_floors * DEFAULT_FLOOR_HEIGHT

        # 정북 이격거리 검토
        north_setback_required = calculate_north_setback(height, use_zone)
        setback_ok = setbacks['back'] >= north_setback_required

        # 높이 제한 검토
        height_limit_str = limits.get('height_limit')
        height_ok = True
        if height_limit_str:
            if '4층' in height_limit_str:
                height_ok = actual_floors <= 4
            elif '3층' in height_limit_str:
                height_ok = actual_floors <= 3

        # 3D 지오메트리 생성
        geometry = self._generate_geometry(
            building_area,
            height,
            buildable_width,
            buildable_depth,
            setbacks
        )

        return {
            'success': True,
            'building_area': round(building_area, 2),
            'total_floor_area': round(total_floor_area, 2),
            'coverage_ratio': round(coverage_ratio, 2),
            'far_ratio': round(far_ratio, 2),
            'floors': actual_floors,
            'height': round(height, 1),
            'legal_check': {
                'coverage_ok': coverage_ok,
                'far_ok': far_ok,
                'height_ok': height_ok,
                'setback_ok': setback_ok,
            },
            'legal_limits': {
                'coverage': legal_coverage,
                'far': legal_far,
                'height_limit': height_limit_str,
            },
            'geometry': geometry,
        }

    def _generate_geometry(
        self,
        building_area: float,
        height: float,
        width: float,
        depth: float,
        setbacks: dict
    ) -> dict:
        """Three.js용 박스 지오메트리 생성"""
        # 건물 중심 위치 (이격거리 고려)
        center_x = (setbacks['left'] - setbacks['right']) / 2
        center_z = (setbacks['front'] - setbacks['back']) / 2

        return {
            'type': 'box',
            'format': 'three.js',
            'dimensions': {
                'width': round(width, 2),
                'height': round(height, 2),
                'depth': round(depth, 2),
            },
            'position': {
                'x': center_x,
                'y': height / 2,  # Three.js는 중심 기준
                'z': center_z,
            },
            'land': {
                'latitude': self.land.latitude,
                'longitude': self.land.longitude,
            }
        }
