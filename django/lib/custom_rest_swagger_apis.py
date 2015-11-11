"""
This is a monkey patch for django-rest-swagger 0.3.4 to improve grouping of
API endpoints into Swagger resources. This patch removes a case where an
endpoint would create a new root path even if another one matched. For
example, if these two paths existed:

    /{pk1}/resource
    /{pk1}/resource/method

root paths for both would be created, although the second endpoint would
be an endpoint in both.

Instead, use the smallest set of endpoints covering the entire path tree
as the root paths and Swagger resources.
"""

import re

from rest_framework_swagger.urlparser import UrlParser


def _minimal_top_level_apis(self, apis):
    """
    Returns the 'top level' APIs (ie. swagger 'resources')
    apis -- list of APIs as returned by self.get_apis
    """
    root_paths = self.explicit_root_paths.copy()
    api_paths = [re.sub(r'/\{[^\}]+\}$', '', endpoint['path'].strip("/")) for endpoint in apis]

    for path in api_paths:
        #  If a URLs /resource/ and /resource/{pk} exist, use the base
        #  as the resource. If there is no base resource URL, then include
        if path.startswith(tuple(root_paths)):
            continue
        root_paths = root_paths - set([p for p in root_paths if p.startswith(path)])
        root_paths.add(path)

    top_level_apis = self.__filter_top_level_apis__(root_paths)

    return sorted(top_level_apis, key=self.__get_last_element__)

UrlParser.explicit_root_paths = set()
UrlParser.get_top_level_apis = _minimal_top_level_apis
