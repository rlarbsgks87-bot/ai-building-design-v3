from django.urls import path
from .views import SunlightAnalysisView, FeasibilityAnalysisView

app_name = 'analysis'

urlpatterns = [
    path('sunlight/', SunlightAnalysisView.as_view(), name='sunlight'),
    path('feasibility/', FeasibilityAnalysisView.as_view(), name='feasibility'),
]
