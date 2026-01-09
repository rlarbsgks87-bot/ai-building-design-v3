# 제주도 건축 규제 상수

JEJU_BUILDING_LIMITS = {
    # 주거지역
    '제1종전용주거지역': {'coverage': 40, 'far': 80},
    '제2종전용주거지역': {'coverage': 40, 'far': 120},
    '제1종일반주거지역': {'coverage': 60, 'far': 200},
    '제2종일반주거지역': {'coverage': 60, 'far': 250},
    '제3종일반주거지역': {'coverage': 50, 'far': 300},
    '준주거지역': {'coverage': 60, 'far': 500},

    # 상업지역
    '중심상업지역': {'coverage': 80, 'far': 1300},
    '일반상업지역': {'coverage': 80, 'far': 1000},
    '근린상업지역': {'coverage': 60, 'far': 700},

    # 공업지역
    '준공업지역': {'coverage': 60, 'far': 300},

    # 녹지/관리지역
    '자연녹지지역': {'coverage': 20, 'far': 80, 'height_limit': '4층 이하'},
    '계획관리지역': {'coverage': 40, 'far': 80, 'height_limit': '4층 이하'},
    '생산관리지역': {'coverage': 20, 'far': 60, 'height_limit': '3층 이하'},
    '보전관리지역': {'coverage': 20, 'far': 60, 'height_limit': '3층 이하'},
    '농림지역': {'coverage': 20, 'far': 50, 'height_limit': '3층 이하'},
}

# 취락지구 특례
SETTLEMENT_DISTRICT_LIMITS = {
    'green': {'coverage': 50, 'far': 100},  # 자연녹지 내 취락지구
    'managed': {'coverage': 60, 'far': 100},  # 관리지역 내 취락지구
}

# 기본값 (알 수 없는 용도지역)
DEFAULT_BUILDING_LIMITS = {'coverage': 20, 'far': 80}

# 층고 기본값 (m)
DEFAULT_FLOOR_HEIGHT = 3.0


def get_building_limits(use_zone: str, is_settlement: bool = False) -> dict:
    """
    용도지역별 건폐율/용적률 조회

    Args:
        use_zone: 용도지역명
        is_settlement: 취락지구 여부

    Returns:
        dict: coverage, far, height_limit, note
    """
    if is_settlement:
        is_green = '녹지' in use_zone
        limits = SETTLEMENT_DISTRICT_LIMITS['green' if is_green else 'managed']
        return {
            'coverage': limits['coverage'],
            'far': limits['far'],
            'height_limit': None,
            'note': '취락지구 특례 적용',
        }

    limits = JEJU_BUILDING_LIMITS.get(use_zone, DEFAULT_BUILDING_LIMITS)
    return {
        'coverage': limits['coverage'],
        'far': limits['far'],
        'height_limit': limits.get('height_limit'),
        'note': None,
    }


def calculate_north_setback(height: float, use_zone: str) -> float:
    """
    정북방향 일조권 이격거리 계산

    Args:
        height: 건물 높이 (m)
        use_zone: 용도지역명

    Returns:
        float: 이격거리 (m)
    """
    if '주거' not in use_zone:
        return 0.0

    if height <= 9:
        return 1.5
    return 1.5 + (height - 9) * 0.5


def get_height_limit_from_setback(setback_distance: float, use_zone: str) -> float:
    """
    정북방향 이격거리에서 허용 높이 계산

    Args:
        setback_distance: 정북방향 인접대지경계선까지 거리 (m)
        use_zone: 용도지역명

    Returns:
        float: 허용 높이 (m)
    """
    if '주거' not in use_zone:
        return float('inf')

    # 높이 = 정북방향 인접대지경계선까지 거리 × 2 + 8m
    return setback_distance * 2 + 8


def get_parking_requirement(building_type: str, total_area: float, unit_count: int = 0) -> int:
    """
    주차대수 산정

    Args:
        building_type: 건물 유형
        total_area: 연면적 (㎡)
        unit_count: 세대수 (공동주택인 경우)

    Returns:
        int: 필요 주차대수
    """
    if building_type in ['단독주택']:
        return max(1, int(total_area / 150))
    elif building_type in ['다세대주택', '다가구주택']:
        return max(1, int(unit_count * 0.7))
    elif building_type in ['아파트']:
        return max(1, int(unit_count * 1.0))
    elif building_type in ['근린생활시설']:
        return max(1, int(total_area / 150))
    elif building_type in ['업무시설']:
        return max(1, int(total_area / 100))
    else:
        return max(1, int(total_area / 150))
