from django.urls import path
from .views import (
    MassCalculateView,
    MassDetailView,
    MassGeometryView,
)

app_name = 'mass'

urlpatterns = [
    path('calculate/', MassCalculateView.as_view(), name='calculate'),
    path('<str:mass_id>/', MassDetailView.as_view(), name='detail'),
    path('<str:mass_id>/geometry/', MassGeometryView.as_view(), name='geometry'),
]
