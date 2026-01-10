import requests
from django.conf import settings
from django.core.cache import cache

from apps.core.constants import get_building_limits


class DataGoKrService:
    """공공데이터포털 API 서비스

    발급된 API 키로 다음 서비스 사용:
    - 건축물대장정보: /BldRgstHubService (일일 10,000건)
    - 토지이용규제정보: /arLandUseInfoService (일일 1,000건)
    - 토지이용규제법령: /LuLawInfoService (일일 1,000건)

    v2: 건축물대장에서 건폐율, 용적률 등 추가 정보 포함
    """

    BASE_URL = 'https://apis.data.go.kr/1613000'

    def __init__(self):
        self.api_key = settings.DATAGO_API_KEY
        self.timeout = 10

    def _get_cached(self, cache_key: str):
        """캐시 조회"""
        return cache.get(cache_key)

    def _set_cached(self, cache_key: str, data, timeout: int = 3600):
        """캐시 저장 (기본 1시간)"""
        cache.set(cache_key, data, timeout)

    def get_building_info(self, pnu: str) -> dict:
        """건축물대장 표제부 조회

        Endpoint: /BldRgstHubService/getBrTitleInfo
        """
        if not self.api_key:
            return {'success': False, 'error': 'API 키가 설정되지 않았습니다', 'buildings': []}

        cache_key = f"building:{pnu}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            # PNU 구조 (19자리): 시군구(5) + 법정동(5) + 대지구분(1) + 본번(4) + 부번(4)
            sigungu_cd = pnu[:5]
            bjdong_cd = pnu[5:10]
            bun = pnu[11:15] if len(pnu) >= 15 else '0000'
            ji = pnu[15:19] if len(pnu) >= 19 else '0000'

            url = f"{self.BASE_URL}/BldRgstHubService/getBrTitleInfo"

            # platGbCd=0 (일반)으로 먼저 시도, 없으면 1 (산)으로 재시도
            for plat_gb_cd in ['0', '1']:
                params = {
                    'serviceKey': self.api_key,
                    'sigunguCd': sigungu_cd,
                    'bjdongCd': bjdong_cd,
                    'platGbCd': plat_gb_cd,
                    'bun': bun,
                    'ji': ji,
                    'numOfRows': 10,
                    'pageNo': 1,
                    '_type': 'json',
                }

                response = requests.get(url, params=params, timeout=self.timeout)
                data = response.json()

                items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
                if items:
                    break  # 데이터가 있으면 루프 종료

            items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
            if not isinstance(items, list):
                items = [items] if items else []

            buildings = []
            for item in items:
                if item.get('mainPurpsCdNm'):
                    buildings.append({
                        'name': item.get('bldNm') or None,
                        'main_purpose': item.get('mainPurpsCdNm'),
                        'etc_purpose': item.get('etcPurps') or None,
                        'total_area': float(item.get('totArea', 0)),
                        'building_area': float(item.get('archArea', 0)),
                        'plat_area': float(item.get('platArea', 0)),
                        'vl_rat_estm_area': float(item.get('vlRatEstmTotArea', 0)),
                        'bc_rat': float(item.get('bcRat', 0)),
                        'vl_rat': float(item.get('vlRat', 0)),
                        'height': float(item.get('heit', 0)),
                        'structure': item.get('strctCdNm') or None,
                        'floors': {
                            'above': int(item.get('grndFlrCnt', 0)),
                            'below': int(item.get('ugrndFlrCnt', 0)),
                        },
                        'parking': {
                            'indoor_mechanical': int(item.get('indrMechUtcnt', 0)),
                            'outdoor_mechanical': int(item.get('oudrMechUtcnt', 0)),
                            'indoor_auto': int(item.get('indrAutoUtcnt', 0)),
                            'outdoor_auto': int(item.get('oudrAutoUtcnt', 0)),
                            'total': int(item.get('indrMechUtcnt', 0)) + int(item.get('oudrMechUtcnt', 0)) + int(item.get('indrAutoUtcnt', 0)) + int(item.get('oudrAutoUtcnt', 0)),
                        },
                        'parking_count': int(item.get('pkngCnt', 0)),
                        'household_count': int(item.get('hhldCnt', 0)),
                        'approval_date': item.get('useAprDay'),
                    })

            result = {
                'success': True,
                'exists': len(buildings) > 0,
                'buildings': buildings,
            }
            self._set_cached(cache_key, result, 86400)  # 24시간
            return result

        except Exception as e:
            return {'success': False, 'error': str(e), 'buildings': []}

    def get_land_use_regulation(self, pnu: str) -> dict:
        """토지이용규제 행위제한정보 조회

        Endpoint: /arLandUseInfoService/getAcrgRegInfoWMS
        """
        if not self.api_key:
            return {'success': False, 'error': 'API 키가 설정되지 않았습니다', 'regulations': []}

        cache_key = f"regulation:{pnu}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            url = f"{self.BASE_URL}/arLandUseInfoService/getAcrgRegInfoWMS"
            params = {
                'serviceKey': self.api_key,
                'pnu': pnu,
                'numOfRows': 100,
                'pageNo': 1,
                '_type': 'json',
            }

            response = requests.get(url, params=params, timeout=self.timeout)
            data = response.json()

            items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
            if not isinstance(items, list):
                items = [items] if items else []

            regulations = []
            for item in items:
                regulations.append({
                    'zone_name': item.get('prpsAreaNm', ''),
                    'restriction_content': item.get('rgltContnt', ''),
                    'law_name': item.get('statutNm', ''),
                })

            result = {
                'success': True,
                'regulations': regulations,
            }
            self._set_cached(cache_key, result, 604800)  # 7일
            return result

        except Exception as e:
            return {'success': False, 'error': str(e), 'regulations': []}

    def get_land_use_actions(self, pnu: str) -> dict:
        """토지이용행위 조회

        Endpoint: /arLandUseInfoService/getActListWMS
        """
        if not self.api_key:
            return {'success': False, 'error': 'API 키가 설정되지 않았습니다', 'actions': []}

        cache_key = f"actions:{pnu}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            url = f"{self.BASE_URL}/arLandUseInfoService/getActListWMS"
            params = {
                'serviceKey': self.api_key,
                'pnu': pnu,
                'numOfRows': 100,
                'pageNo': 1,
                '_type': 'json',
            }

            response = requests.get(url, params=params, timeout=self.timeout)
            data = response.json()

            items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
            if not isinstance(items, list):
                items = [items] if items else []

            actions = []
            for item in items:
                actions.append({
                    'action_name': item.get('actNm', ''),
                    'possible': item.get('psbYn', ''),
                    'condition': item.get('cdtnContnt', ''),
                })

            result = {
                'success': True,
                'actions': actions,
            }
            self._set_cached(cache_key, result, 604800)  # 7일
            return result

        except Exception as e:
            return {'success': False, 'error': str(e), 'actions': []}

    def get_land_characteristics(self, pnu: str) -> dict:
        """토지특성정보 조회

        Endpoint: /1611000/nsdi/LandCharacteristicsService/wfs/getLandCharacteristics
        국토교통부 토지특성정보 API (공공데이터포털)
        """
        if not self.api_key:
            return {'success': False, 'error': 'API 키가 설정되지 않았습니다'}

        cache_key = f"land_char:{pnu}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            # 국토교통부 토지특성정보 API
            url = "https://apis.data.go.kr/1611000/nsdi/LandCharacteristicsService/wfs/getLandCharacteristics"
            params = {
                'serviceKey': self.api_key,
                'pnu': pnu,
                'format': 'json',
                'numOfRows': 1,
                'pageNo': 1,
            }

            response = requests.get(url, params=params, timeout=self.timeout)
            data = response.json()

            # 응답 파싱
            features = data.get('landCharacteristicss', {}).get('field', [])
            if not features:
                features = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])

            if features:
                item = features[0] if isinstance(features, list) else features
                result = {
                    'success': True,
                    'area': float(item.get('lndpclAr', 0) or 0),
                    'land_category': item.get('lndcgrCodeNm', '대'),
                    'jiga': float(item.get('pblntfPclnd', 0) or 0),
                    'use_zone': item.get('prposArea1Nm', ''),
                    'terrain_height': item.get('tpgrphHgCodeNm', '-'),
                    'terrain_shape': item.get('tpgrphFrmCodeNm', '-'),
                    'road_side': item.get('roadSideCodeNm', '-'),
                }
                self._set_cached(cache_key, result, 604800)  # 7일
                return result

            return {'success': False, 'error': '토지정보를 찾을 수 없습니다'}

        except Exception as e:
            return {'success': False, 'error': str(e)}


class KakaoLocalService:
    """카카오 로컬 API 서비스

    좌표→주소 변환을 통해 도로명 정보 조회
    """

    BASE_URL = 'https://dapi.kakao.com/v2/local'

    def __init__(self):
        self.api_key = getattr(settings, 'KAKAO_REST_API_KEY', '')
        self.timeout = 10

    def get_road_name_by_coord(self, lng: float, lat: float) -> dict:
        """좌표로 도로명 주소 조회

        Returns:
            dict: {
                success: bool,
                road_name: str,  # 도로명 (예: '연북로')
                road_address: str,  # 전체 도로명 주소
                building_name: str,  # 건물명
            }
        """
        if not self.api_key:
            return {'success': False, 'error': 'Kakao API 키가 설정되지 않았습니다'}

        cache_key = f"kakao_road:{lng:.6f}_{lat:.6f}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            url = f"{self.BASE_URL}/geo/coord2address.json"
            headers = {'Authorization': f'KakaoAK {self.api_key}'}
            params = {'x': lng, 'y': lat}

            response = requests.get(url, headers=headers, params=params, timeout=self.timeout)
            data = response.json()

            if data.get('documents'):
                doc = data['documents'][0]
                road_address = doc.get('road_address') or {}

                result = {
                    'success': True,
                    'road_name': road_address.get('road_name', ''),  # 도로명
                    'road_address': road_address.get('address_name', ''),  # 전체 도로명 주소
                    'building_name': road_address.get('building_name', ''),
                    'region': road_address.get('region_3depth_name', ''),  # 동/읍/면
                }
                cache.set(cache_key, result, 86400)  # 24시간
                return result

            return {'success': False, 'error': '주소를 찾을 수 없습니다'}

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_parcel_road_address(self, address: str) -> dict:
        """주소로 필지의 도로명주소 조회 (주소 검색 API)

        Args:
            address: 지번주소 (예: '제주시 도남동 50-11')

        Returns:
            dict: {
                success: bool,
                road_name: str,  # 도로명 (예: '신성로4길')
                road_address: str,  # 전체 도로명 주소
                direction: str,  # 도로 방향 (필지 도로명주소의 도로는 보통 전면 도로)
            }
        """
        if not self.api_key:
            return {'success': False, 'error': 'Kakao API 키가 설정되지 않았습니다'}

        import urllib.parse
        cache_key = f"kakao_parcel_road:{urllib.parse.quote(address)}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            url = f"{self.BASE_URL}/search/address.json"
            headers = {'Authorization': f'KakaoAK {self.api_key}'}
            params = {'query': address}

            response = requests.get(url, headers=headers, params=params, timeout=self.timeout)
            data = response.json()

            if data.get('documents'):
                doc = data['documents'][0]
                road_address = doc.get('road_address') or {}

                if road_address.get('road_name'):
                    result = {
                        'success': True,
                        'road_name': road_address.get('road_name', ''),
                        'road_address': road_address.get('address_name', ''),
                        'direction': 'north',  # 기본값, 나중에 필지 형상으로 정확히 계산
                    }
                    cache.set(cache_key, result, 86400)  # 24시간
                    return result

            return {'success': False, 'error': '도로명주소를 찾을 수 없습니다'}

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_nearest_road(self, center_lng: float, center_lat: float, bbox: dict = None, search_directions: list = None) -> dict:
        """필지 주변 도로 정보 조회 (필지 경계 기준 검색)

        Args:
            center_lng, center_lat: 필지 중심 좌표
            bbox: 필지 바운딩 박스 {minX, minY, maxX, maxY}
            search_directions: 검색할 방향 리스트 ['south', 'north', 'east', 'west']

        Returns:
            dict: {
                success: bool,
                roads: [{ direction, road_name, road_address }]
            }
        """
        import math

        if not search_directions:
            search_directions = ['south', 'north', 'east', 'west']

        # bbox가 있으면 경계 바깥쪽을 검색 (도로까지 충분한 거리)
        offset_meters = 30  # 경계에서 30m 바깥 (도로 도달 보장)
        lat_offset = offset_meters / 111320
        lng_offset = offset_meters / (111320 * math.cos(math.radians(center_lat)))

        if bbox:
            # 필지 경계 바깥쪽 좌표 계산
            search_points = {
                'south': (center_lng, bbox['minY'] - lat_offset),
                'north': (center_lng, bbox['maxY'] + lat_offset),
                'east': (bbox['maxX'] + lng_offset, center_lat),
                'west': (bbox['minX'] - lng_offset, center_lat),
            }
        else:
            # bbox 없으면 중심에서 검색
            search_points = {
                'south': (center_lng, center_lat - lat_offset * 2),
                'north': (center_lng, center_lat + lat_offset * 2),
                'east': (center_lng + lng_offset * 2, center_lat),
                'west': (center_lng - lng_offset * 2, center_lat),
            }

        roads = []
        for direction in search_directions:
            if direction not in search_points:
                continue

            search_lng, search_lat = search_points[direction]
            result = self.get_road_name_by_coord(search_lng, search_lat)
            if result.get('success') and result.get('road_name'):
                roads.append({
                    'direction': direction,
                    'road_name': result['road_name'],
                    'road_address': result.get('road_address', ''),
                })

        return {
            'success': True,
            'roads': roads,
        }


class LambdaProxyService:
    """AWS Lambda 프록시를 통한 VWorld API 호출 서비스

    ai-building-design 프로젝트의 Lambda 프록시 패턴 사용
    - 지오코딩: POST { type: 'geocode', address }
    - 지적정보: GET ?pnu=xxx
    - 토지이용: GET ?type=landuse&pnu=xxx
    - 주변정보: GET ?type=nearby&pnu=xxx&x=xxx&y=xxx
    """

    def __init__(self):
        # Lambda API Gateway는 trailing slash 필요
        base = settings.LAMBDA_PROXY_URL.rstrip('/')
        self.base_url = f"{base}/"
        self.timeout = 15

    def _calculate_polygon_area(self, geometry: dict) -> float:
        """폴리곤 좌표에서 면적 계산 (Shoelace formula + WGS84→m² 변환)

        cadastral.geometry에서 면적 계산
        landChar가 없을 때 대체 면적 계산에 사용
        """
        import math

        coords = geometry.get('coordinates', [[]])
        geom_type = geometry.get('type', '')

        # MultiPolygon 또는 Polygon 처리
        if geom_type == 'MultiPolygon':
            polygon_coords = coords[0][0] if coords and coords[0] else []
        elif geom_type == 'Polygon':
            polygon_coords = coords[0] if coords else []
        else:
            polygon_coords = coords

        if not polygon_coords or len(polygon_coords) < 3:
            return 0

        # 중심점 계산 (WGS84 → 미터 변환용)
        lngs = [c[0] for c in polygon_coords]
        lats = [c[1] for c in polygon_coords]
        center_lat = sum(lats) / len(lats)

        # WGS84 좌표를 미터로 변환
        lat_rad = math.radians(center_lat)
        meters_per_lat = 111320  # 위도 1도 = 약 111km
        meters_per_lng = 111320 * math.cos(lat_rad)  # 경도 1도 = 111km * cos(위도)

        # 좌표를 미터 단위로 변환
        coords_m = []
        for coord in polygon_coords:
            x_m = coord[0] * meters_per_lng
            y_m = coord[1] * meters_per_lat
            coords_m.append((x_m, y_m))

        # Shoelace formula로 면적 계산
        n = len(coords_m)
        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += coords_m[i][0] * coords_m[j][1]
            area -= coords_m[j][0] * coords_m[i][1]

        return abs(area) / 2.0

    def _get_cached(self, cache_key: str):
        """캐시 조회"""
        return cache.get(cache_key)

    def _set_cached(self, cache_key: str, data, timeout: int = 300):
        """캐시 저장 (기본 5분)"""
        cache.set(cache_key, data, timeout)

    def geocode(self, address: str) -> dict:
        """주소 → 좌표 변환 (POST 방식)"""
        cache_key = f"geocode:{address}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            response = requests.post(
                self.base_url,
                json={'type': 'geocode', 'address': address},
                timeout=self.timeout
            )
            response.raise_for_status()
            data = response.json()

            # Lambda 응답 파싱
            if data.get('response', {}).get('status') == 'OK':
                refined = data['response'].get('refined', {})
                result = data['response'].get('result', {})
                point = result.get('point', {})

                parsed = {
                    'success': True,
                    'x': float(point.get('x', 0)),
                    'y': float(point.get('y', 0)),
                    'address': refined.get('text', address),
                    'pnu': refined.get('structure', {}).get('level4LC', ''),
                    'sido': refined.get('structure', {}).get('level1', ''),
                    'sigungu': refined.get('structure', {}).get('level2', ''),
                    'dong': refined.get('structure', {}).get('level4L', ''),
                    'jibun': refined.get('structure', {}).get('level5', ''),
                }
                self._set_cached(cache_key, parsed, settings.CACHE_TIMEOUTS.get('geocode', 86400))
                return parsed

            return {'success': False, 'error': '주소를 찾을 수 없습니다'}

        except requests.RequestException as e:
            return {'success': False, 'error': str(e)}

    def get_cadastral(self, pnu: str) -> dict:
        """지적정보 조회 (GET ?pnu=xxx)

        jeju-land-analysis 패턴 적용:
        - cadastral: 지적도 데이터 (geometry 포함)
        - landChar: 토지특성정보 (면적, 용도지역 등)

        landChar가 없을 때 cadastral.geometry에서 면적 계산
        """
        cache_key = f"cadastral:{pnu}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            url = f"{self.base_url}?pnu={pnu}"
            response = requests.get(url, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            # Lambda 응답에서 지적정보 추출
            cadastral = data.get('cadastral') or {}
            land_char = data.get('landChar') or {}

            # 데이터가 없으면 실패 반환
            if not cadastral and not land_char:
                return {'success': False, 'error': 'NOT_FOUND'}

            # 공시지가 추출 (cadastral.jiga는 문자열, landChar.pblntfPclnd는 숫자)
            jiga = 0
            if cadastral.get('jiga'):
                try:
                    jiga = float(cadastral.get('jiga'))
                except (ValueError, TypeError):
                    jiga = 0
            if not jiga and land_char.get('pblntfPclnd'):
                jiga = float(land_char.get('pblntfPclnd', 0))

            # 면적 추출: landChar 우선, 없으면 cadastral.geometry에서 계산
            area = float(land_char.get('lndpclAr', 0) or 0)
            if area == 0 and cadastral.get('geometry'):
                # landChar가 없거나 면적이 0일 때 geometry에서 면적 계산
                area = round(self._calculate_polygon_area(cadastral['geometry']), 2)

            # 지목 추출: cadastral.jibun에서 파싱 (예: "290-34대" → "대")
            land_category = land_char.get('lndcgrCodeNm', '')
            if not land_category and cadastral.get('jibun'):
                jibun = cadastral.get('jibun', '')
                # 숫자와 '-'를 제외한 마지막 글자가 지목
                for char in reversed(jibun):
                    if not char.isdigit() and char != '-' and char != ' ':
                        land_category = char
                        break
            if not land_category:
                land_category = '대'

            parsed = {
                'success': True,
                'jiga': jiga,
                'land_category': land_category,
                'area': area,
                'ownership': land_char.get('ownshipDivNm', '-') if land_char else '-',
                'land_use_situation': land_char.get('ladUseSittnNm', '-') if land_char else '-',
                'terrain_height': land_char.get('tpgrphHgCodeNm', '-') if land_char else '-',
                'terrain_shape': land_char.get('tpgrphFrmCodeNm', '-') if land_char else '-',
                'road_side': land_char.get('roadSideCodeNm', '-') if land_char else '-',
                'use_zone': land_char.get('prposArea1Nm', '') if land_char else '',
                'address': cadastral.get('addr', ''),
            }
            self._set_cached(cache_key, parsed, settings.CACHE_TIMEOUTS.get('parcel_info', 604800))
            return parsed

        except requests.RequestException as e:
            return {'success': False, 'error': str(e)}

    def get_land_use(self, pnu: str) -> dict:
        """토지이용계획 조회 (GET ?type=landuse&pnu=xxx)"""
        cache_key = f"landuse:{pnu}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            url = f"{self.base_url}?type=landuse&pnu={pnu}"
            response = requests.get(url, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            land_uses = data.get('landUses', {}).get('field', [])
            zones = []

            for item in land_uses:
                zone_name = item.get('prposAreaDstrcCodeNm')
                if zone_name:
                    zones.append({
                        'name': zone_name,
                        'law': '국토의 계획 및 이용에 관한 법률',
                    })

            parsed = {
                'success': True,
                'zones': zones,
                'primary_zone': zones[0]['name'] if zones else '',
            }
            self._set_cached(cache_key, parsed, settings.CACHE_TIMEOUTS.get('use_zone', 604800))
            return parsed

        except requests.RequestException as e:
            return {'success': False, 'error': str(e), 'zones': []}

    def get_nearby(self, pnu: str, x: float, y: float, radius: int = 100) -> dict:
        """주변 건물/도로 조회 (GET ?type=nearby&pnu=xxx&x=xxx&y=xxx)"""
        cache_key = f"nearby:{pnu}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            url = f"{self.base_url}?type=nearby&pnu={pnu}&x={x}&y={y}&radius={radius}"
            response = requests.get(url, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            parsed = {
                'success': True,
                'buildings': data.get('buildings', []),
                'roads': data.get('roads', []),
            }
            self._set_cached(cache_key, parsed, 300)  # 5분
            return parsed

        except requests.RequestException:
            # Nearby API가 아직 구현되지 않았을 수 있음
            return {'success': True, 'buildings': [], 'roads': []}


class VWorldService:
    """VWorld API 서비스 (Lambda 프록시 우선, 직접 호출 백업)"""

    BASE_URL = 'https://api.vworld.kr/req'
    DATA_URL = 'https://api.vworld.kr/req/data'

    def __init__(self):
        self.api_key = settings.VWORLD_API_KEY
        self.lambda_proxy = LambdaProxyService()

    def _make_request(self, endpoint: str, params: dict, timeout: int = 10) -> dict:
        """API 요청 공통 메서드"""
        params['key'] = self.api_key
        try:
            response = requests.get(
                f'{self.BASE_URL}/{endpoint}',
                params=params,
                timeout=timeout
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            return {'error': str(e)}

    def get_land_characteristics(self, pnu: str) -> dict:
        """토지특성정보 직접 조회 (VWorld 연속지적도 API)

        연속지적도(LP_PA_CBND_BUBUN)에서 공시지가와 폴리곤을 가져와서
        면적을 계산합니다.
        """
        if not self.api_key:
            return {'success': False, 'error': 'VWorld API 키가 없습니다'}

        cache_key = f"vworld_land:{pnu}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            # 연속지적도에서 토지 정보 조회 (공시지가, 폴리곤 포함)
            params = {
                'service': 'data',
                'request': 'GetFeature',
                'data': 'LP_PA_CBND_BUBUN',
                'key': self.api_key,
                'domain': settings.VWORLD_DOMAIN,
                'attrFilter': f'pnu:=:{pnu}',
                'format': 'json',
                'errorformat': 'json',
                'crs': 'EPSG:4326',
                'geometry': 'true',
                'attribute': 'true',
            }

            response = requests.get(self.DATA_URL, params=params, timeout=15)
            data = response.json()

            if data.get('response', {}).get('status') == 'OK':
                features = data['response'].get('result', {}).get('featureCollection', {}).get('features', [])
                if features:
                    feature = features[0]
                    props = feature.get('properties', {})
                    geometry = feature.get('geometry', {})

                    # 공시지가 추출
                    jiga = 0
                    if props.get('jiga'):
                        try:
                            jiga = float(props.get('jiga'))
                        except (ValueError, TypeError):
                            jiga = 0

                    # 폴리곤에서 면적 계산
                    area = self._calculate_polygon_area(geometry)

                    # 지목 추출 (예: "290-34대" → "대")
                    jibun = props.get('jibun', '')
                    land_category = ''
                    if jibun:
                        # 숫자와 '-'를 제외한 마지막 글자가 지목
                        for char in reversed(jibun):
                            if not char.isdigit() and char != '-':
                                land_category = char
                                break

                    result = {
                        'success': True,
                        'area': round(area, 2),
                        'land_category': land_category or '대',
                        'jiga': jiga,
                        'use_zone': '',  # 토지이용계획에서 별도 조회
                        'address': props.get('addr', ''),
                    }
                    cache.set(cache_key, result, 604800)  # 7일
                    return result

            return {'success': False, 'error': '토지정보를 찾을 수 없습니다'}

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _calculate_polygon_area(self, geometry: dict) -> float:
        """폴리곤 좌표에서 면적 계산 (Shoelace formula + WGS84→m² 변환)"""
        import math

        coords = geometry.get('coordinates', [[]])
        geom_type = geometry.get('type', '')

        # MultiPolygon 또는 Polygon 처리
        if geom_type == 'MultiPolygon':
            polygon_coords = coords[0][0] if coords and coords[0] else []
        elif geom_type == 'Polygon':
            polygon_coords = coords[0] if coords else []
        else:
            polygon_coords = coords

        if not polygon_coords or len(polygon_coords) < 3:
            return 0

        # 중심점 계산 (WGS84 → 미터 변환용)
        lngs = [c[0] for c in polygon_coords]
        lats = [c[1] for c in polygon_coords]
        center_lat = sum(lats) / len(lats)

        # WGS84 좌표를 미터로 변환
        lat_rad = math.radians(center_lat)
        meters_per_lat = 111320  # 위도 1도 = 약 111km
        meters_per_lng = 111320 * math.cos(lat_rad)  # 경도 1도 = 111km * cos(위도)

        # 좌표를 미터 단위로 변환
        coords_m = []
        for coord in polygon_coords:
            x_m = coord[0] * meters_per_lng
            y_m = coord[1] * meters_per_lat
            coords_m.append((x_m, y_m))

        # Shoelace formula로 면적 계산
        n = len(coords_m)
        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += coords_m[i][0] * coords_m[j][1]
            area -= coords_m[j][0] * coords_m[i][1]

        return abs(area) / 2.0

    def get_adjacent_roads(self, pnu: str, bbox: dict = None) -> dict:
        """인접 도로 지오메트리 조회 (VWorld 연속지적도 - 지목이 '도'인 필지)

        Args:
            pnu: 대상 필지 PNU
            bbox: 바운딩 박스 {minX, minY, maxX, maxY} (WGS84)

        Returns:
            dict: {
                success: bool,
                roads: [
                    {
                        pnu: str,
                        geometry: [[lng, lat], ...],
                        jimok: str,
                        direction: str  # 'north', 'south', 'east', 'west', 'unknown'
                    }
                ]
            }
        """
        import math
        import logging
        logger = logging.getLogger(__name__)

        cache_key = f"adjacent_roads_v13:{pnu}"  # v13: WFS 디버깅
        cached = cache.get(cache_key)
        if cached:
            return cached

        # bbox가 없으면 먼저 필지 지오메트리를 조회
        parcel_center = None
        if not bbox:
            parcel_geom = self.get_parcel_geometry(pnu)
            if parcel_geom.get('success'):
                bbox = parcel_geom.get('bbox')
                parcel_center = parcel_geom.get('center', {})
            # 지오메트리 실패해도 계속 진행 (Kakao fallback 사용)

        if bbox and not parcel_center:
            parcel_center = {
                'lng': (bbox['minX'] + bbox['maxX']) / 2,
                'lat': (bbox['minY'] + bbox['maxY']) / 2,
            }

        # parcel_center가 없으면 빈 결과 반환 (VWorld와 bbox 모두 실패)
        if not parcel_center:
            return {
                'success': True,
                'roads': [],
                'kakao_roads': [],
                'parcel_center': None,
                'error': 'VWorld API 일시적 오류'
            }

        # bbox 확장 (약 50m 버퍼)
        lat_rad = math.radians(parcel_center['lat'])
        meters_per_lat = 111320
        meters_per_lng = 111320 * math.cos(lat_rad)

        buffer_meters = 50  # 50m 버퍼
        lng_buffer = buffer_meters / meters_per_lng
        lat_buffer = buffer_meters / meters_per_lat

        expanded_bbox = {
            'minX': bbox['minX'] - lng_buffer,
            'minY': bbox['minY'] - lat_buffer,
            'maxX': bbox['maxX'] + lng_buffer,
            'maxY': bbox['maxY'] + lat_buffer,
        }

        roads = []
        adjacent_parcels = []  # 주변 필지 (도로 제외)

        if self.api_key:
            try:
                # VWorld WFS로 bbox 내 지적도 조회
                bbox_str = f"{expanded_bbox['minX']},{expanded_bbox['minY']},{expanded_bbox['maxX']},{expanded_bbox['maxY']}"

                params = {
                    'service': 'data',
                    'request': 'GetFeature',
                    'data': 'LP_PA_CBND_BUBUN',  # 연속지적도
                    'key': self.api_key,
                    'domain': settings.VWORLD_DOMAIN,
                    'geomFilter': f'BOX({bbox_str})',
                    'format': 'json',
                    'errorformat': 'json',
                    'crs': 'EPSG:4326',
                    'geometry': 'true',
                    'attribute': 'true',
                    'size': 100,  # 최대 100개 필지
                }

                response = requests.get(self.DATA_URL, params=params, timeout=15)
                data = response.json()

                # 디버깅: VWorld 응답 로그
                logger.info(f"VWorld WFS response status: {data.get('response', {}).get('status')}")
                logger.info(f"VWorld WFS bbox: {bbox_str}")
                if data.get('response', {}).get('status') != 'OK':
                    logger.warning(f"VWorld WFS error: {data.get('response', {}).get('error', {})}")

                if data.get('response', {}).get('status') == 'OK':
                    features = data['response'].get('result', {}).get('featureCollection', {}).get('features', [])
                    logger.info(f"VWorld WFS found {len(features)} features")

                    for feature in features:
                        props = feature.get('properties', {})
                        geometry = feature.get('geometry', {})
                        feature_pnu = props.get('pnu', '')

                        # 본인 필지 제외
                        if feature_pnu == pnu:
                            continue

                        # 지번에서 지목 추출 (예: "290-34도" → "도")
                        jibun = props.get('jibun', '')
                        jimok = ''
                        if jibun:
                            for char in reversed(jibun):
                                if not char.isdigit() and char != '-' and char != ' ':
                                    jimok = char
                                    break

                        # 폴리곤 좌표 추출
                        coords = geometry.get('coordinates', [[]])
                        geom_type = geometry.get('type', '')

                        if geom_type == 'MultiPolygon':
                            polygon_coords = coords[0][0] if coords and coords[0] else []
                        elif geom_type == 'Polygon':
                            polygon_coords = coords[0] if coords else []
                        else:
                            polygon_coords = coords

                        if not polygon_coords:
                            continue

                        # 중심점 계산
                        center_lngs = [c[0] for c in polygon_coords]
                        center_lats = [c[1] for c in polygon_coords]
                        center_lng = sum(center_lngs) / len(center_lngs)
                        center_lat = sum(center_lats) / len(center_lats)

                        # 필지 중심과의 상대 위치로 방향 결정
                        dx = center_lng - parcel_center['lng']
                        dy = center_lat - parcel_center['lat']

                        # 방향 결정 (북/남/동/서)
                        if abs(dx) > abs(dy):
                            direction = 'east' if dx > 0 else 'west'
                        else:
                            direction = 'north' if dy > 0 else 'south'

                        parcel_data = {
                            'pnu': feature_pnu,
                            'geometry': polygon_coords,
                            'jimok': jimok,
                            'jibun': jibun,
                            'direction': direction,
                            'center': {'lng': center_lng, 'lat': center_lat},
                        }

                        # 지목이 '도'(도로)인 경우 roads에, 아니면 adjacent_parcels에
                        if jimok == '도':
                            roads.append(parcel_data)
                        else:
                            adjacent_parcels.append(parcel_data)

            except Exception as e:
                logger.error(f"VWorld WFS exception: {str(e)}")

        # VWorld에서 도로를 찾지 못한 경우 Kakao API로 도로명 조회 (fallback)
        kakao_roads = []
        if not roads:
            try:
                kakao = KakaoLocalService()
                # 1. 필지 중심 좌표에서 직접 도로명 조회 (필지의 도로명주소에서 도로명 추출)
                center_result = kakao.get_road_name_by_coord(
                    parcel_center['lng'],
                    parcel_center['lat']
                )
                if center_result.get('success') and center_result.get('road_name'):
                    # 필지 중심에서 찾은 도로명 = 필지가 접한 도로
                    # 방향은 필지 형상에서 도로와 가장 가까운 변으로 결정
                    # (기본적으로 도로명주소가 있는 필지는 해당 도로에 접함)
                    road_name = center_result['road_name']
                    road_address = center_result.get('road_address', '')

                    # 방향 결정: 8방향 검색으로 도로 위치 정확히 파악
                    import math
                    offset_m = 8  # 8m 거리
                    lat_offset = offset_m / 111320
                    lng_offset = offset_m / (111320 * math.cos(math.radians(parcel_center['lat'])))

                    found_directions = []
                    found_points = {}  # 좌표 저장 (각도 계산용)
                    if bbox:
                        # 8방향 검색 (4방향 + 대각선)
                        direction_checks = [
                            ('N', (parcel_center['lng'], bbox['maxY'] + lat_offset)),
                            ('NE', (bbox['maxX'] + lng_offset * 0.7, bbox['maxY'] + lat_offset * 0.7)),
                            ('E', (bbox['maxX'] + lng_offset, parcel_center['lat'])),
                            ('SE', (bbox['maxX'] + lng_offset * 0.7, bbox['minY'] - lat_offset * 0.7)),
                            ('S', (parcel_center['lng'], bbox['minY'] - lat_offset)),
                            ('SW', (bbox['minX'] - lng_offset * 0.7, bbox['minY'] - lat_offset * 0.7)),
                            ('W', (bbox['minX'] - lng_offset, parcel_center['lat'])),
                            ('NW', (bbox['minX'] - lng_offset * 0.7, bbox['maxY'] + lat_offset * 0.7)),
                        ]
                        for dir_name, (check_lng, check_lat) in direction_checks:
                            check_result = kakao.get_road_name_by_coord(check_lng, check_lat)
                            if check_result.get('road_name') == road_name:
                                found_directions.append(dir_name)
                                found_points[dir_name] = (check_lng, check_lat)

                    # 8방향을 4방향으로 매핑하여 도로 방향 결정
                    direction_mapping = {
                        'N': 'north', 'NE': 'north', 'NW': 'north',
                        'S': 'south', 'SE': 'south', 'SW': 'south',
                        'E': 'east', 'W': 'west',
                    }

                    # 발견된 방향들을 4방향으로 변환하고 우선순위 적용
                    priority_order = ['north', 'south', 'east', 'west']
                    mapped_directions = set()
                    for d in found_directions:
                        mapped_directions.add(direction_mapping.get(d, d))

                    direction = 'north'  # 기본값
                    for priority_dir in priority_order:
                        if priority_dir in mapped_directions:
                            direction = priority_dir
                            break

                    # 도로 각도 계산 (2개 이상 포인트가 있을 때)
                    road_angle = None
                    if len(found_points) >= 2:
                        points = list(found_points.values())
                        # 가장 먼 두 점 찾기
                        max_dist = 0
                        p1, p2 = points[0], points[1]
                        for i, pi in enumerate(points):
                            for pj in points[i+1:]:
                                dist = (pi[0] - pj[0])**2 + (pi[1] - pj[1])**2
                                if dist > max_dist:
                                    max_dist = dist
                                    p1, p2 = pi, pj

                        # 각도 계산 (동쪽=0°, 반시계)
                        dx = p2[0] - p1[0]
                        dy = p2[1] - p1[1]
                        # 경도/위도를 미터로 변환 시 고려
                        dx_m = dx * 111320 * math.cos(math.radians(parcel_center['lat']))
                        dy_m = dy * 111320
                        road_angle = math.degrees(math.atan2(dy_m, dx_m))
                        # -90° ~ 90° 범위로 정규화 (도로 기울기만 필요, 방향은 무관)
                        while road_angle > 90:
                            road_angle -= 180
                        while road_angle < -90:
                            road_angle += 180

                    kakao_roads.append({
                        'direction': direction,
                        'road_name': road_name,
                        'road_address': road_address,
                        'angle': road_angle,  # 도로 각도 (도 단위, 동쪽=0°)
                        'found_directions': found_directions,  # 디버깅용
                    })
                else:
                    # 2. 필지 중심에서 도로명을 찾지 못한 경우 경계 검색으로 fallback
                    kakao_result = kakao.get_nearest_road(
                        parcel_center['lng'],
                        parcel_center['lat'],
                        bbox=bbox
                    )
                    if kakao_result.get('success'):
                        kakao_roads = kakao_result.get('roads', [])
            except Exception:
                pass

        # 도로 폭 정보 추출 (use_zones에서 파싱)
        road_width = None
        try:
            land_use = self.lambda_proxy.get_land_use(pnu)
            if land_use.get('success'):
                import re
                for zone in land_use.get('zones', []):
                    zone_name = zone.get('name', '')
                    # "소로2류(폭 8m~10m)" 형태에서 폭 추출
                    match = re.search(r'\(폭\s*(\d+)m[~\-](\d+)m\)', zone_name)
                    if match:
                        road_width = {
                            'min': int(match.group(1)),
                            'max': int(match.group(2)),
                            'average': (int(match.group(1)) + int(match.group(2))) / 2,
                            'source': zone_name,
                        }
                        break
                    # "대로1류(폭 25m이상)" 형태
                    match = re.search(r'\(폭\s*(\d+)m이상\)', zone_name)
                    if match:
                        width_val = int(match.group(1))
                        road_width = {
                            'min': width_val,
                            'max': width_val + 10,  # 이상이므로 여유값
                            'average': width_val + 5,
                            'source': zone_name,
                        }
                        break
        except Exception:
            pass

        result = {
            'success': True,
            'roads': roads,
            'adjacent_parcels': adjacent_parcels,  # 주변 필지 (도로 제외)
            'kakao_roads': kakao_roads,  # Kakao API에서 조회한 도로명 정보
            'parcel_center': parcel_center,
            'road_width': road_width,  # 도로 폭 정보 (use_zones에서 추출)
        }
        cache.set(cache_key, result, 604800)  # 7일
        return result

    def get_parcel_geometry(self, pnu: str) -> dict:
        """필지 폴리곤 지오메트리 조회 (Lambda 프록시 우선, VWorld 직접 호출 백업)

        Returns:
            dict: {
                success: bool,
                geometry: [[lng, lat], ...],  # 폴리곤 좌표
                bbox: { minX, minY, maxX, maxY },  # 바운딩 박스 (WGS84)
                dimensions: { width, depth },  # 미터 단위 크기
                center: { lng, lat }  # 중심점
            }
        """
        cache_key = f"parcel_geom:{pnu}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        import math
        geometry = None
        coords = None

        # 1차: Lambda 프록시를 통해 geometry 가져오기 (VWorld 도메인 검증 우회)
        try:
            url = f"{self.lambda_proxy.base_url}?pnu={pnu}"
            response = requests.get(url, timeout=15)
            if response.status_code == 200:
                data = response.json()
                cadastral = data.get('cadastral') or {}
                if cadastral.get('geometry'):
                    geometry = cadastral['geometry']
                    coords = geometry.get('coordinates', [[]])
        except Exception as e:
            pass  # Lambda 실패시 VWorld 직접 호출로 fallback

        # 2차: Lambda 실패시 VWorld 직접 호출 (백업)
        if not geometry and self.api_key:
            try:
                params = {
                    'service': 'data',
                    'request': 'GetFeature',
                    'data': 'LP_PA_CBND_BUBUN',
                    'key': self.api_key,
                    'domain': settings.VWORLD_DOMAIN,
                    'attrFilter': f'pnu:=:{pnu}',
                    'format': 'json',
                    'errorformat': 'json',
                    'crs': 'EPSG:4326',
                    'geometry': 'true',
                    'attribute': 'true',
                }

                response = requests.get(self.DATA_URL, params=params, timeout=15)
                data = response.json()

                if data.get('response', {}).get('status') == 'OK':
                    features = data['response'].get('result', {}).get('featureCollection', {}).get('features', [])
                    if features:
                        feature = features[0]
                        geometry = feature.get('geometry', {})
                        coords = geometry.get('coordinates', [[]])
            except Exception:
                pass

        # geometry 처리
        if geometry and coords:
            # MultiPolygon 또는 Polygon 처리
            if geometry.get('type') == 'MultiPolygon':
                polygon_coords = coords[0][0]  # 첫 번째 폴리곤의 외곽선
            elif geometry.get('type') == 'Polygon':
                polygon_coords = coords[0]  # 외곽선
            else:
                polygon_coords = coords

            if not polygon_coords:
                return {'success': False, 'error': '폴리곤 좌표가 없습니다'}

            # 바운딩 박스 계산
            lngs = [c[0] for c in polygon_coords]
            lats = [c[1] for c in polygon_coords]
            min_lng, max_lng = min(lngs), max(lngs)
            min_lat, max_lat = min(lats), max(lats)

            # 중심점
            center_lng = (min_lng + max_lng) / 2
            center_lat = (min_lat + max_lat) / 2

            # WGS84 좌표를 미터로 변환 (Haversine 근사)
            lat_rad = math.radians(center_lat)

            # 위도 1도 = 약 111km, 경도 1도 = 111km * cos(위도)
            meters_per_lat = 111320
            meters_per_lng = 111320 * math.cos(lat_rad)

            width = (max_lng - min_lng) * meters_per_lng
            depth = (max_lat - min_lat) * meters_per_lat

            result = {
                'success': True,
                'geometry': polygon_coords,
                'bbox': {
                    'minX': min_lng,
                    'minY': min_lat,
                    'maxX': max_lng,
                    'maxY': max_lat,
                },
                'dimensions': {
                    'width': round(width, 2),
                    'depth': round(depth, 2),
                },
                'center': {
                    'lng': center_lng,
                    'lat': center_lat,
                },
            }
            cache.set(cache_key, result, 604800)  # 7일
            return result

        return {'success': False, 'error': '필지 지오메트리를 찾을 수 없습니다'}

    def search_address(self, query: str) -> dict:
        """주소 검색 (Lambda 프록시 우선 사용)"""
        cache_key = f"search:{query}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        # Lambda 프록시를 통한 지오코딩으로 검색 (VWORLD_API_KEY 불필요)
        # 제주 주소 보정
        full_query = query
        if '제주' not in query:
            full_query = f'제주특별자치도 {query}'

        geocode_result = self.lambda_proxy.geocode(full_query)

        if geocode_result.get('success'):
            result = {
                'success': True,
                'data': [
                    {
                        'title': geocode_result.get('address', query),
                        'address': geocode_result.get('address', ''),
                        'road_address': '',
                        'x': geocode_result.get('x', 0),
                        'y': geocode_result.get('y', 0),
                        'pnu': geocode_result.get('pnu', ''),
                        'sido': geocode_result.get('sido', ''),
                        'sigungu': geocode_result.get('sigungu', ''),
                        'dong': geocode_result.get('dong', ''),
                        'jibun': geocode_result.get('jibun', ''),
                    }
                ]
            }
            cache.set(cache_key, result, settings.CACHE_TIMEOUTS.get('address_search', 3600))
            return result

        # Lambda 실패 시 VWORLD_API_KEY가 있으면 직접 호출 시도
        if self.api_key:
            params = {
                'service': 'search',
                'request': 'search',
                'version': '2.0',
                'crs': 'EPSG:4326',
                'type': 'ADDRESS',
                'category': 'PARCEL',
                'query': full_query,
                'size': 10,
                'format': 'json',
                'errorformat': 'json',
            }

            data = self._make_request('search', params)

            if data.get('response', {}).get('status') == 'OK':
                items = data['response'].get('result', {}).get('items', [])
                result = {
                    'success': True,
                    'data': [
                        {
                            'title': item.get('address', {}).get('parcel', '') or item.get('title', ''),
                            'address': item.get('address', {}).get('parcel', ''),
                            'road_address': item.get('address', {}).get('road', ''),
                            'x': float(item.get('point', {}).get('x', 0)),
                            'y': float(item.get('point', {}).get('y', 0)),
                            'pnu': item.get('id', ''),
                        }
                        for item in items
                    ]
                }
                cache.set(cache_key, result, settings.CACHE_TIMEOUTS.get('address_search', 3600))
                return result

        return {'success': False, 'data': [], 'error': geocode_result.get('error', '주소를 찾을 수 없습니다')}

    def get_parcel_by_point(self, x: float, y: float) -> dict:
        """좌표로 필지 조회 (Lambda 프록시를 통한 reverse geocoding)"""
        cache_key = f"parcel_point:{x:.6f}_{y:.6f}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            # Lambda 프록시를 통해 reverse geocoding 호출
            response = requests.post(
                self.lambda_proxy.base_url,
                json={'type': 'reverse', 'x': x, 'y': y},
                timeout=15
            )

            # JSON 파싱 에러 처리
            try:
                data = response.json()
            except Exception:
                return {'success': False, 'error': f'Lambda 프록시 응답 오류: {response.text[:200]}'}

            # Lambda 프록시 응답 파싱
            if data.get('response', {}).get('status') == 'OK':
                results = data['response'].get('result', [])
                if results:
                    result_item = results[0]
                    structure = result_item.get('structure', {})

                    # 법정동 코드 (10자리)
                    level4LC = structure.get('level4LC', '')
                    jibun = structure.get('level5', '')

                    # PNU 생성 (19자리): 법정동코드(10) + 대지구분(1) + 본번(4) + 부번(4)
                    pnu = self._build_pnu(level4LC, jibun)

                    addr = result_item.get('text', '')

                    result = {
                        'success': True,
                        'data': {
                            'pnu': pnu,
                            'address': addr,
                            'jibun': jibun,
                            'sido': structure.get('level1', ''),
                            'sigungu': structure.get('level2', ''),
                            'dong': structure.get('level4L', ''),
                            'x': x,
                            'y': y,
                        }
                    }
                    cache.set(cache_key, result, 3600)
                    return result

            # 에러 메시지 반환
            error_msg = data.get('error', data.get('response', {}).get('error', {}).get('text', '해당 좌표에 필지 정보가 없습니다'))
            return {'success': False, 'error': f'Lambda: {error_msg}'}

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _build_pnu(self, level4LC: str, jibun: str) -> str:
        """법정동코드와 지번으로 PNU 생성"""
        if not level4LC or not jibun:
            return ''

        # 지번 파싱 (예: "50-11", "195-1", "산50-11")
        is_san = jibun.startswith('산')
        jibun_clean = jibun.replace('산', '').strip()

        # 본번-부번 분리
        if '-' in jibun_clean:
            parts = jibun_clean.split('-')
            bun = parts[0]
            ji = parts[1] if len(parts) > 1 else '0'
        else:
            bun = jibun_clean
            ji = '0'

        # 숫자만 추출
        bun = ''.join(filter(str.isdigit, bun)) or '0'
        ji = ''.join(filter(str.isdigit, ji)) or '0'

        # 대지구분: 0(일반), 1(산)
        plat_gb = '1' if is_san else '0'

        # PNU 조합 (19자리)
        pnu = f"{level4LC}{plat_gb}{bun.zfill(4)}{ji.zfill(4)}"
        return pnu


class LandService:
    """토지 정보 서비스 (Lambda 프록시 + 공공데이터포털 활용)"""

    def __init__(self):
        self.lambda_proxy = LambdaProxyService()
        self.vworld = VWorldService()
        self.datago = DataGoKrService()

    def get_land_analysis(self, address: str) -> dict:
        """주소 기반 토지 분석 (원본 프로젝트 패턴 + 공공데이터 확장)"""
        # 제주 주소 보정
        full_address = address
        if '제주' not in address:
            full_address = f'제주특별자치도 {address}'

        # 1. 지오코딩
        geocode = self.lambda_proxy.geocode(full_address)
        if not geocode.get('success'):
            return {'success': False, 'error': geocode.get('error', '주소를 찾을 수 없습니다')}

        pnu = geocode.get('pnu', '')
        x = geocode.get('x', 0)
        y = geocode.get('y', 0)

        if not pnu or not x or not y:
            return {'success': False, 'error': '좌표 또는 PNU를 찾을 수 없습니다'}

        # 2. 지적정보 & 토지이용계획 조회 (Lambda 프록시)
        cadastral = self.lambda_proxy.get_cadastral(pnu) if pnu else {}
        land_use = self.lambda_proxy.get_land_use(pnu) if pnu else {}

        # 3. 공공데이터포털 API 조회 (건축물대장 + 토지이용규제)
        building_info = self.datago.get_building_info(pnu) if pnu else {}
        regulation_info = self.datago.get_land_use_regulation(pnu) if pnu else {}

        # 용도지역 결정
        primary_zone = cadastral.get('use_zone') or land_use.get('primary_zone', '')
        if not primary_zone:
            # 동/읍면 기준 추정
            dong = geocode.get('dong', '')
            is_urban = dong.endswith('동')
            primary_zone = '제2종일반주거지역' if is_urban else '계획관리지역'

        # 취락지구 확인
        is_settlement = False
        for zone in land_use.get('zones', []):
            zone_name = zone.get('name', '')
            if '취락지구' in zone_name:
                is_settlement = True
                break

        # 건폐율/용적률 기준 (취락지구 특례 적용)
        limits = get_building_limits(primary_zone, is_settlement=is_settlement)

        return {
            'success': True,
            'geocode': {
                'address': geocode.get('address'),
                'pnu': pnu,
                'coordinates': {'x': x, 'y': y},
                'sido': geocode.get('sido'),
                'sigungu': geocode.get('sigungu'),
                'dong': geocode.get('dong'),
                'jibun': geocode.get('jibun'),
            },
            'land_char': {
                'land_category': cadastral.get('land_category', '대'),
                'area': cadastral.get('area', 0),
                'official_land_price': cadastral.get('jiga', 0),
                'ownership': cadastral.get('ownership', '-'),
                'land_use_situation': cadastral.get('land_use_situation', '-'),
                'terrain_height': cadastral.get('terrain_height', '-'),
                'terrain_shape': cadastral.get('terrain_shape', '-'),
                'road_side': cadastral.get('road_side', '-'),
            },
            'land_use': land_use.get('zones', []),
            'building': {
                'exists': building_info.get('exists', False),
                'buildings': building_info.get('buildings', []),
            },
            'regulations': regulation_info.get('regulations', []),
            'standards': {
                'use_zone': primary_zone,
                'coverage': limits['coverage'],
                'far': limits['far'],
                'height_limit': limits.get('height_limit'),
                'note': limits.get('note'),
            },
        }

    def get_land_detail(self, pnu: str, x: float = None, y: float = None) -> dict:
        """토지 상세 정보 조회 (기존 메서드 호환)"""
        from .models import LandCache

        # 캐시 확인 (유효한 데이터만)
        try:
            cached = LandCache.objects.get(pnu=pnu)
            # parcel_area가 0보다 큰 경우에만 캐시 사용
            if cached.parcel_area and cached.parcel_area > 0:
                # 건축물대장 정보는 항상 실시간 조회 (캐시 안함)
                building_info = self.datago.get_building_info(pnu)
                # 토지이용계획도 실시간 조회
                land_use = self.lambda_proxy.get_land_use(pnu)
                land_use_zones = land_use.get('zones', []) if land_use.get('success') else []
                return {
                    'success': True,
                    'data': {
                        'pnu': cached.pnu,
                        'address_jibun': cached.address_jibun,
                        'address_road': cached.address_road,
                        'parcel_area': cached.parcel_area,
                        'use_zone': cached.use_zone,
                        'use_zones': land_use_zones,
                        'official_land_price': cached.official_land_price,
                        'latitude': cached.latitude,
                        'longitude': cached.longitude,
                        'building': {
                            'exists': building_info.get('exists', False),
                            'buildings': building_info.get('buildings', []),
                        },
                    },
                    'cached': True,
                }
        except LandCache.DoesNotExist:
            pass

        # Lambda 프록시로 조회
        if pnu:
            cadastral = self.lambda_proxy.get_cadastral(pnu)
            land_use = self.lambda_proxy.get_land_use(pnu)

            use_zone = ''
            parcel_area = 0
            jiga = 0

            if cadastral.get('success'):
                use_zone = cadastral.get('use_zone') or ''
                parcel_area = cadastral.get('area') or 0
                jiga = cadastral.get('jiga') or 0

            address_jibun = ''

            # Lambda 프록시가 데이터를 반환하지 않으면 다른 API 시도
            if not parcel_area or parcel_area == 0:
                # 1. VWorld API 직접 호출 시도 (연속지적도 - 공시지가, 면적, 주소 포함)
                vworld_data = self.vworld.get_land_characteristics(pnu)
                if vworld_data.get('success'):
                    # area가 0이 아닌 경우에만 업데이트 (area > 0 체크)
                    if vworld_data.get('area') and vworld_data.get('area') > 0:
                        parcel_area = vworld_data.get('area')
                    # jiga는 별도로 업데이트
                    if vworld_data.get('jiga') and vworld_data.get('jiga') > 0:
                        jiga = vworld_data.get('jiga')
                    # 주소 업데이트
                    if vworld_data.get('address'):
                        address_jibun = vworld_data.get('address')
                    # 용도지역 업데이트
                    if vworld_data.get('use_zone'):
                        use_zone = vworld_data.get('use_zone')

                # 2. VWorld도 실패하면 공공데이터포털 API 시도
                if not parcel_area or parcel_area == 0:
                    datago_data = self.datago.get_land_characteristics(pnu)
                    if datago_data.get('success'):
                        if datago_data.get('area') and datago_data.get('area') > 0:
                            parcel_area = datago_data.get('area')
                        if datago_data.get('jiga') and datago_data.get('jiga') > 0:
                            jiga = datago_data.get('jiga') if not jiga else jiga
                        if datago_data.get('use_zone') and not use_zone:
                            use_zone = datago_data.get('use_zone')

            # 토지이용계획에서 용도지역 가져오기
            if not use_zone and land_use.get('success'):
                use_zone = land_use.get('primary_zone', '')

            # 건축물대장 정보 조회
            building_info = self.datago.get_building_info(pnu)

            # 토지이용계획 zones 가져오기
            land_use_zones = []
            if land_use.get('success'):
                land_use_zones = land_use.get('zones', [])

            land_data = {
                'pnu': pnu,
                'address_jibun': address_jibun,
                'address_road': '',
                'parcel_area': parcel_area,
                'use_zone': use_zone,
                'use_zones': land_use_zones,  # 토지이용계획 전체 zones
                'official_land_price': jiga,
                'latitude': y,
                'longitude': x,
                'building': {
                    'exists': building_info.get('exists', False),
                    'buildings': building_info.get('buildings', []),
                },
            }

            # 캐시 저장 (유효한 데이터만)
            if x and y and parcel_area > 0:
                LandCache.objects.update_or_create(
                    pnu=pnu,
                    defaults={
                        'address_jibun': land_data['address_jibun'],
                        'parcel_area': land_data['parcel_area'],
                        'use_zone': land_data['use_zone'],
                        'official_land_price': land_data['official_land_price'],
                        'latitude': y,
                        'longitude': x,
                    }
                )

            return {
                'success': True,
                'data': land_data,
                'cached': False,
            }

        return {'success': False, 'error': 'NOT_FOUND'}

    def get_regulation(self, pnu: str) -> dict:
        """법규 검토"""
        from .models import LandCache

        try:
            land = LandCache.objects.get(pnu=pnu)
        except LandCache.DoesNotExist:
            return {'success': False, 'error': 'NOT_FOUND'}

        use_zone = land.use_zone or ''

        # 토지이용계획 조회하여 취락지구 확인
        land_use = self.lambda_proxy.get_land_use(pnu)
        is_settlement = False
        if land_use.get('success'):
            zones = land_use.get('zones', [])
            for zone in zones:
                zone_name = zone.get('name', '')
                if '취락지구' in zone_name:
                    is_settlement = True
                    break

        limits = get_building_limits(use_zone, is_settlement=is_settlement)

        parcel_area = land.parcel_area or 0
        max_building_area = parcel_area * limits['coverage'] / 100
        max_floor_area = parcel_area * limits['far'] / 100

        return {
            'success': True,
            'data': {
                'pnu': pnu,
                'address': land.address_jibun,
                'parcel_area': parcel_area,
                'use_zone': use_zone,
                'coverage': limits['coverage'],
                'far': limits['far'],
                'height_limit': limits.get('height_limit'),
                'north_setback': 1.5,  # 기본값
                'note': limits.get('note'),
                'max_building_area': round(max_building_area, 2),
                'max_floor_area': round(max_floor_area, 2),
            }
        }
