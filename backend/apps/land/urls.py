from django.urls import path
from .views import (
    AddressSearchView,
    GeocodeView,
    LandDetailView,
    LandRegulationView,
    ParcelByPointView,
    VWorldWMSProxyView,
    VWorldWFSProxyView,
    LandAnalysisView,
)

app_name = 'land'

urlpatterns = [
    path('search/', AddressSearchView.as_view(), name='search'),
    path('geocode/', GeocodeView.as_view(), name='geocode'),
    path('analyze/', LandAnalysisView.as_view(), name='analyze'),
    path('by-point/', ParcelByPointView.as_view(), name='by-point'),
    path('<str:pnu>/', LandDetailView.as_view(), name='detail'),
    path('<str:pnu>/regulation/', LandRegulationView.as_view(), name='regulation'),
    # VWorld 프록시
    path('proxy/wms/', VWorldWMSProxyView.as_view(), name='proxy-wms'),
    path('proxy/wfs/', VWorldWFSProxyView.as_view(), name='proxy-wfs'),
]
