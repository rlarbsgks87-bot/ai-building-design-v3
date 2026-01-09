from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model

from .serializers import (
    UserSerializer,
    RegisterSerializer,
    LoginSerializer,
    ProfileSerializer,
)

User = get_user_model()


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'success': True,
                'message': '회원가입이 완료되었습니다.',
                'data': {
                    'user': UserSerializer(user).data,
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                }
            }, status=status.HTTP_201_CREATED)
        return Response({
            'success': False,
            'error': 'VALIDATION_ERROR',
            'message': '입력값을 확인해주세요.',
            'details': serializer.errors,
        }, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            password = serializer.validated_data['password']

            # email을 username으로 사용
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'UNAUTHORIZED',
                    'message': '이메일 또는 비밀번호가 올바르지 않습니다.',
                }, status=status.HTTP_401_UNAUTHORIZED)

            user = authenticate(username=user.username, password=password)
            if user is None:
                return Response({
                    'success': False,
                    'error': 'UNAUTHORIZED',
                    'message': '이메일 또는 비밀번호가 올바르지 않습니다.',
                }, status=status.HTTP_401_UNAUTHORIZED)

            refresh = RefreshToken.for_user(user)
            return Response({
                'success': True,
                'data': {
                    'user': UserSerializer(user).data,
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                }
            })

        return Response({
            'success': False,
            'error': 'VALIDATION_ERROR',
            'message': '입력값을 확인해주세요.',
            'details': serializer.errors,
        }, status=status.HTTP_400_BAD_REQUEST)


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': 'refresh 토큰이 필요합니다.',
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            refresh = RefreshToken(refresh_token)
            return Response({
                'success': True,
                'data': {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                }
            })
        except Exception:
            return Response({
                'success': False,
                'error': 'UNAUTHORIZED',
                'message': '유효하지 않은 토큰입니다.',
            }, status=status.HTTP_401_UNAUTHORIZED)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'success': True,
            'data': UserSerializer(request.user).data,
        })


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'success': True,
            'data': ProfileSerializer(request.user).data,
        })

    def put(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                'success': True,
                'message': '프로필이 업데이트되었습니다.',
                'data': serializer.data,
            })
        return Response({
            'success': False,
            'error': 'VALIDATION_ERROR',
            'message': '입력값을 확인해주세요.',
            'details': serializer.errors,
        }, status=status.HTTP_400_BAD_REQUEST)
