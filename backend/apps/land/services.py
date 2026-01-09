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
                        'total_area': float(item.get('totArea', 0)),
                        'building_area': float(item.get('archArea', 0)),
                        'floors': {
                            'above': int(item.get('grndFlrCnt', 0)),
                            'below': int(item.get('ugrndFlrCnt', 0)),
                        },
                        'parking_count': int(item.get('pkngCnt', 0)),
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
        """지적정보 조회 (GET ?pnu=xxx)"""
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

            # 면적 추출
            area = float(land_char.get('lndpclAr', 0) or 0)

            parsed = {
                'success': True,
                'jiga': jiga,
                'land_category': land_char.get('lndcgrCodeNm', '대'),
                'area': area,
                'ownership': land_char.get('ownshipDivNm', '-'),
                'land_use_situation': land_char.get('ladUseSittnNm', '-'),
                'terrain_height': land_char.get('tpgrphHgCodeNm', '-'),
                'terrain_shape': land_char.get('tpgrphFrmCodeNm', '-'),
                'road_side': land_char.get('roadSideCodeNm', '-'),
                'use_zone': land_char.get('prposArea1Nm', ''),
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
        """토지특성정보 직접 조회 (VWorld Data API)"""
        if not self.api_key:
            return {'success': False, 'error': 'VWorld API 키가 없습니다'}

        cache_key = f"vworld_land:{pnu}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            # 토지특성정보 조회
            params = {
                'service': 'data',
                'request': 'GetFeature',
                'data': 'LT_C_LHBLPN',
                'key': self.api_key,
                'domain': 'localhost',
                'attrFilter': f'pnu:=:{pnu}',
                'format': 'json',
                'errorformat': 'json',
                'crs': 'EPSG:4326',
            }

            response = requests.get(self.DATA_URL, params=params, timeout=15)
            data = response.json()

            if data.get('response', {}).get('status') == 'OK':
                features = data['response'].get('result', {}).get('featureCollection', {}).get('features', [])
                if features:
                    props = features[0].get('properties', {})
                    result = {
                        'success': True,
                        'area': float(props.get('lndpclAr', 0)),
                        'land_category': props.get('lndcgrCodeNm', '대'),
                        'jiga': float(props.get('pblntfPclnd', 0)),
                        'use_zone': props.get('prposArea1Nm', ''),
                        'terrain_height': props.get('tpgrphHgCodeNm', '-'),
                        'terrain_shape': props.get('tpgrphFrmCodeNm', '-'),
                        'road_side': props.get('roadSideCodeNm', '-'),
                    }
                    cache.set(cache_key, result, 604800)  # 7일
                    return result

            # 연속지적도에서 면적 조회 시도
            params2 = {
                'service': 'data',
                'request': 'GetFeature',
                'data': 'LP_PA_CBND_BUBUN',
                'key': self.api_key,
                'domain': 'localhost',
                'attrFilter': f'pnu:=:{pnu}',
                'format': 'json',
                'errorformat': 'json',
                'crs': 'EPSG:4326',
            }

            response2 = requests.get(self.DATA_URL, params=params2, timeout=15)
            data2 = response2.json()

            if data2.get('response', {}).get('status') == 'OK':
                features2 = data2['response'].get('result', {}).get('featureCollection', {}).get('features', [])
                if features2:
                    props2 = features2[0].get('properties', {})
                    result = {
                        'success': True,
                        'area': float(props2.get('bonbeon', 0)) if props2.get('bonbeon') else 0,
                        'land_category': props2.get('jibun', ''),
                        'jiga': 0,
                        'use_zone': '',
                    }
                    cache.set(cache_key, result, 604800)
                    return result

            return {'success': False, 'error': '토지정보를 찾을 수 없습니다'}

        except Exception as e:
            return {'success': False, 'error': str(e)}

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

        # 건폐율/용적률 기준
        limits = get_building_limits(primary_zone)

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
                return {
                    'success': True,
                    'data': {
                        'pnu': cached.pnu,
                        'address_jibun': cached.address_jibun,
                        'address_road': cached.address_road,
                        'parcel_area': cached.parcel_area,
                        'use_zone': cached.use_zone,
                        'official_land_price': cached.official_land_price,
                        'latitude': cached.latitude,
                        'longitude': cached.longitude,
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

            # Lambda 프록시가 데이터를 반환하지 않으면 다른 API 시도
            if not parcel_area or parcel_area == 0:
                # 1. VWorld API 직접 호출 시도
                vworld_data = self.vworld.get_land_characteristics(pnu)
                if vworld_data.get('success') and vworld_data.get('area'):
                    parcel_area = vworld_data.get('area') or 0
                    jiga = vworld_data.get('jiga') or jiga
                    use_zone = vworld_data.get('use_zone') or use_zone

                # 2. VWorld도 실패하면 공공데이터포털 API 시도
                if not parcel_area or parcel_area == 0:
                    datago_data = self.datago.get_land_characteristics(pnu)
                    if datago_data.get('success'):
                        parcel_area = datago_data.get('area') or 0
                        jiga = datago_data.get('jiga') or jiga
                        use_zone = datago_data.get('use_zone') or use_zone

            # 토지이용계획에서 용도지역 가져오기
            if not use_zone and land_use.get('success'):
                use_zone = land_use.get('primary_zone', '')

            land_data = {
                'pnu': pnu,
                'address_jibun': '',
                'address_road': '',
                'parcel_area': parcel_area,
                'use_zone': use_zone,
                'official_land_price': jiga,
                'latitude': y,
                'longitude': x,
            }

            # 캐시 저장 (유효한 데이터만)
            if x and y and parcel_area > 0:
                LandCache.objects.update_or_create(
                    pnu=pnu,
                    defaults={
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
        limits = get_building_limits(use_zone)

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
