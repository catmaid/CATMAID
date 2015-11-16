from rest_framework import serializers
from catmaid.models import Volume


#class BoundingBoxSerializer(serializers.Serializer):


class VolumeSerializer(serializers.ModelSerializer):

    class Meta:
        model = Volume
        fields = ('id', 'name', 'comment', 'user', 'editor', 'project',
                'creation_time', 'edition_time')
