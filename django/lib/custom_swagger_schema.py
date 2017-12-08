# -*- coding: utf-8 -*-
from __future__ import unicode_literals

# This implementation was copied from:
# https://github.com/m-haziq/django-rest-swagger-docs#integrating-django-rest-swagger

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_swagger import renderers
from rest_framework.schemas import SchemaGenerator
from requests.compat import urljoin
import six
import yaml
import coreapi


class CustomSchemaGenerator(SchemaGenerator):
    def get_link(self, path, method, view):
        fields = self.get_path_fields(path, method, view)
        existing_field_names = [f.name for f in fields]

        _method_desc = None
        api_doc = None
        yaml_doc = None
        if view:
            # If there ar method specific methods, check them for documentation
            doc = None
            m = method.lower()
            method_fn = getattr(view, m, None)
            if method_fn and method_fn.__doc__:
                doc = method_fn.__doc__

            if not doc and view.__doc__:
                doc = view.__doc__

            if doc:
                try:
                    # Extract schema information from yaml, expect the documentation to be
                    # devided into two YAML documents: The top one is a general verbatim
                    # description of the API. The second document is the API specification.
                    api_components = doc.split('---')
                    api_doc = api_components[0]
                    api_spec = api_components[1]
                    yaml_doc = yaml.load(api_spec)
                except:
                    yaml_doc = None

            if api_doc:
                _method_desc = api_doc

        if not _method_desc:
            _method_desc = view.__doc__ if view and view.__doc__ else ''

        # Remove any leading or trailing whitespace, otherwise everthing becomes
        # a block quote (due to Python comments being indented).
        _method_desc = '\n'.join(l.strip() for l in _method_desc.splitlines())

        if yaml_doc and type(yaml_doc) != str:
            params = yaml_doc.get('parameters', [])

            params_type = type(params)
            if params_type == dict:
                for param_name, param in six.iteritems(params):
                    if not param.get('name'):
                        param['name'] = param_name
                params = list(params.values())
            elif params_type != list:
                raise ValueError("Unknown parameter type ({}) in API spec for "
                        "path {}".format(params_type, path))

            for i in params:
                _name = i.get('name')
                _desc = i.get('description')
                _required = i.get('required', False)
                _type = i.get('type', 'string')
                _location = i.get('paramType', 'form')
                field = coreapi.Field(
                    name=_name,
                    location=_location,
                    required=_required,
                    description=_desc,
                    type=_type
                )
                try:
                    existing_field_index = existing_field_names.index(_name)
                    fields[existing_field_index] = field
                except ValueError:
                    fields.append(field)
        else:
            fields += self.get_serializer_fields(path, method, view)

        fields += self.get_pagination_fields(path, method, view)
        fields += self.get_filter_fields(path, method, view)

        if fields and any([field.location in ('form', 'body') for field in fields]):
            encoding = self.get_encoding(path, method, view)
        else:
            encoding = None

        if self.url and path.startswith('/'):
            path = path[1:]

        return coreapi.Link(
            url=urljoin(self.url, path),
            action=method.lower(),
            encoding=encoding,
            fields=fields,
            description=_method_desc
        )


class SwaggerSchemaView(APIView):
    exclude_from_schema = True
    permission_classes = [AllowAny]
    renderer_classes = [
        renderers.OpenAPIRenderer,
        renderers.SwaggerUIRenderer
    ]

    def get(self, request):
        generator = CustomSchemaGenerator()
        schema = generator.get_schema(request=request)
        return Response(schema)
