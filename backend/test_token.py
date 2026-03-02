from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()
username = 'testuser'
password = 'TestPass123'
if not User.objects.filter(username=username).exists():
    u = User.objects.create_user(username=username, password=password)
    print('Created user')
else:
    u = User.objects.get(username=username)
    u.set_password(password)
    u.save()
    print('Reset password')

serializer = TokenObtainPairSerializer(data={'username': username, 'password': password})
if serializer.is_valid():
    print('Token OK')
    print(serializer.validated_data)
else:
    print('Token failed')
    print(serializer.errors)
