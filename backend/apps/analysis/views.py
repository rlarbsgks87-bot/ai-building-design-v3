from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.core.decorators import premium_only


class SunlightAnalysisView(APIView):
    """일조 분석 API (유료)"""

    @premium_only(feature_name='일조분석')
    def post(self, request):
        # TODO: 실제 일조 분석 로직 구현
        return Response({
            'success': True,
            'data': {
                'message': '일조 분석 결과',
            }
        })


class FeasibilityAnalysisView(APIView):
    """수익성 분석 API (유료)"""

    @premium_only(feature_name='수익성분석')
    def post(self, request):
        # TODO: 실제 수익성 분석 로직 구현
        return Response({
            'success': True,
            'data': {
                'message': '수익성 분석 결과',
            }
        })
