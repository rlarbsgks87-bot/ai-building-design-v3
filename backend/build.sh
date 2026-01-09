#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate

# Create superuser if not exists
python manage.py shell << EOF
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(email='admin@aibuilding.com').exists():
    User.objects.create_superuser(email='admin@aibuilding.com', password='admin1234!')
    print('Superuser created: admin@aibuilding.com')
else:
    print('Superuser already exists')
EOF
