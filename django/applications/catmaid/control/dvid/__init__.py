# -*- coding: utf-8 -*-

from collections import defaultdict
from django.http import JsonResponse
import json
from typing import Any, DefaultDict, Dict, List
from urllib.request import Request, build_opener
from urllib.error import HTTPError, URLError

from catmaid.models import Stack

# These DVID instance types are supported by CATMAID
SUPPORTED_INSTANCE_TYPES = ('imagetile', 'imageblk')


class DVIDClient:

    def __init__(self, url) -> None:
        self.url = url.rstrip('/')
        self.info = get_server_info(url)

    def get_repository(self, repo_id):
        repo = self.info.get(repo_id)
        if not repo:
            raise ValueError("Repository %s is not available from the "
                             "DVID server at %s" % (repo_id, self.url))
        return repo

    def get_instances(self, repo_id):
        repo = self.get_repository(repo_id)
        return repo.get('DataInstances')

    def get_instance(self, repo_id, instance_id):
        instances = self.get_instances(repo_id)
        instance = instances.get(instance_id) if instances else None
        if not instance:
            raise ValueError("Instance %s is not part of repository %s on DVID server %s" %
                         (instance_id, repo_id, self.url))
        return instance

    def get_instance_source(self, repo_id, instance_id):
        instance = self.get_instance(repo_id, instance_id)
        extended = instance.get('Extended')
        source_id = extended['Source'] if extended else None
        if not extended or not source_id:
            raise ValueError("Couldn't find information on source of "
                             "instance %s" % instance_id)
        return self.get_instance(repo_id, source_id)

    def get_instance_type_map(self) -> Dict[str, List[Dict[str, Any]]]:
        """Return a dictionary of data instances available in a DVID dictionary
        data structure, organized by type.

        This data structure is parsed from the returned JSON of a DVID server's
        info URL. Returned is a mapping from data instance type to instance names.
        """
        instance_key = 'DataInstances'
        instances = defaultdict(list) # type: DefaultDict[str, List]

        for repo_id in self.info:
            repo = self.info[repo_id]
            # Ignore repos that don't have data instance defined
            if instance_key not in repo:
                continue

            for instance_id in repo[instance_key]:
                instance = repo[instance_key][instance_id]
                if 'Base' not in instance:
                    continue
                base = instance['Base']
                if 'TypeName' not in base:
                    continue

                instances[base['TypeName']].append({
                    'instance': instance_id,
                    'repo': repo_id
                })

        return dict(instances)

    def get_instance_properties(self, repo_id, instance_id) -> Dict[str, Any]:
        """Create an instance of a Stack model based on a data instance in a
        DVID repository available from the given DVID URL.

        The returned Stack instance is not saved to the database. This is the
        responsibility of the caller.
        """
        instance = self.get_instance(repo_id, instance_id)
        source = self.get_instance_source(repo_id, instance_id)
        image_base = '%s/api/node/%s/%s/tile/' % (self.url, repo_id, instance_id)

        levels = instance['Extended'].get('Levels')
        if not levels:
            raise ValueError("Couldn't find zoom level information for "
                             "instance %s" % instance_id)

        # Use the smallest zoom level as reference (should be 0).
        ref_level_id = sorted(levels.keys())[0]
        ref_level = levels.get(ref_level_id)

        # Tile size
        tile_size = ref_level.get('TileSize')
        if not tile_size:
            raise ValueError("Couldn't find tile size for instance %s " % instance_id)

        # Resolution
        res_data = ref_level['Resolution']
        resolution = {'x': res_data[0], 'y': res_data[1], 'z': res_data[2]}

        # Make sure all levels have the same tile size
        for level, level_data in levels.items():
            ts = ref_level.get('TileSize')
            if not tile_size:
                raise ValueError("Couldn't find tile size for zoom level "
                                 "%s in instance %s " % (level, instance_id))
            if ts[0] != tile_size[0] or ts[1] != tile_size[1]:
                raise ValueError("Tile sizes of zoom levels %s and %s of "
                                 "instance %s differ, they need to be the "
                                 "same" % (ref_level_id, level, instance_id))

        # Dimensions
        min_point = source['Extended']['MinPoint']
        max_point = source['Extended']['MaxPoint']
        dimension = {
            'x': int(max_point[0]) - int(min_point[0]),
            'y': int(max_point[1]) - int(min_point[1]),
            'z': int(max_point[2]) - int(min_point[2])
        }

        return {
            'dimension': dimension,
            'resolution': resolution,
            'image_base': image_base,
            'num_zoom_levels': len(levels) - 1,
            'file_extension': 'jpg:80',
            'tile_width': tile_size[0],
            'tile_height': tile_size[1],
            'tile_source_type': 8,
        }


def get_server_info(url:str):
    """Return the parsed JSON result of a DVID server's info endpoint.
    """
    try:
        info_url = '%s/api/repos/info' % url
        req = Request(info_url, headers={'Content-Type': 'application/json'})
        opener = build_opener()
        info_json = opener.open(req).read()
    except HTTPError as e:
        raise ValueError("Couldn't retrieve DVID project information from %s" % url)
    except URLError as e:
        raise ValueError("Couldn't retrieve DVID project information from %s" % url)

    return json.loads(info_json)
