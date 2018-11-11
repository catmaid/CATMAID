# -*- coding: utf-8 -*-

# This implementation is based on
# https://github.com/m-haziq/django-rest-swagger-docs#integrating-django-rest-swagger

from rest_framework.schemas.inspectors import AutoSchema
from requests.compat import urljoin
import yaml
import coreapi


class CustomSchema(AutoSchema):
    def get_link(self, path, method, base_url):
        fields = self.get_path_fields(path, method)
        existing_field_names = [f.name for f in fields]

        _method_desc = None
        api_doc = None
        yaml_doc = None

        view = self.view
        if view:
            # If there ar method specific methods, check them for documentation
            doc = None
            method_name = getattr(view, 'action', method.lower())
            method_docstring = getattr(view, method_name, None).__doc__

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
                for param_name, param in params.items():
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
            fields += self.get_serializer_fields(path, method)

        fields += self.get_pagination_fields(path, method)
        fields += self.get_filter_fields(path, method)

        if fields and any([field.location in ('form', 'body') for field in fields]):
            encoding = self.get_encoding(path, method)
        else:
            encoding = None

        if base_url and path.startswith('/'):
            path = path[1:]

        return coreapi.Link(
            url=urljoin(base_url, path),
            action=method.lower(),
            encoding=encoding,
            fields=fields,
            description=_method_desc
        )
