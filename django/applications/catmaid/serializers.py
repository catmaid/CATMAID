# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from rest_framework.serializers import ModelSerializer
from catmaid.models import ClassInstance, Point, Volume


class VolumeSerializer(ModelSerializer):

    class Meta:
        model = Volume
        fields = ('id', 'name', 'comment', 'user', 'editor', 'project',
                'creation_time', 'edition_time')

class PointSerializer(ModelSerializer):
    class Meta:
        model = Point
        read_only_fields = ('id',)
        fields = ('id', 'user', 'project', 'creation_time',
                'edition_time', 'editor', 'location_x', 'location_y',
                'location_z',' radius', 'confidence')

class BasicClassInstanceSerializer(ModelSerializer):
    class Meta:
        model = ClassInstance
        read_only_fields = ('id',)
        fields = ('id', 'name', 'user', 'project', 'creation_time',
                'edition_time')
