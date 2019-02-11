# -*- coding: utf-8 -*-
from django.utils import timezone
from rest_framework.serializers import ModelSerializer, DateTimeField
from catmaid.models import ClassInstance, Point, Volume


class VolumeSerializer(ModelSerializer):
    # We want to return UTC times by default, not the server timezone
    creation_time = DateTimeField(default_timezone=timezone.utc)
    edition_time = DateTimeField(default_timezone=timezone.utc)

    class Meta:
        model = Volume
        fields = ('id', 'name', 'comment', 'user', 'editor', 'project',
                'creation_time', 'edition_time')

class PointSerializer(ModelSerializer):
    # We want to return UTC times by default, not the server timezone
    creation_time = DateTimeField(default_timezone=timezone.utc)
    edition_time = DateTimeField(default_timezone=timezone.utc)

    class Meta:
        model = Point
        read_only_fields = ('id',)
        fields = ('id', 'user', 'project', 'creation_time',
                'edition_time', 'editor', 'location_x', 'location_y',
                'location_z',' radius', 'confidence')

class BasicClassInstanceSerializer(ModelSerializer):
    # We want to return UTC times by default, not the server timezone
    creation_time = DateTimeField(default_timezone=timezone.utc)
    edition_time = DateTimeField(default_timezone=timezone.utc)

    class Meta:
        model = ClassInstance
        read_only_fields = ('id',)
        fields = ('id', 'name', 'user', 'project', 'creation_time',
                'edition_time')
