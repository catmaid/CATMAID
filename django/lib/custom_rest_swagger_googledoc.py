# -*- coding: utf-8 -*-

from django.utils.safestring import mark_safe
from django.utils.encoding import smart_text

from rest_framework.utils import formatting

from sphinx.ext.napoleon import Config
from sphinx.ext.napoleon.docstring import GoogleDocstring


def get_googledocstring(view_cls, html=False):
    """Parses a docstring containing Google-style docs into HTML.

    This uses the Napoleon Sphinx extension to parse Google-style argument
    docstrings into reStructuredText, then convert these into HTML for
    django-rest-swagger.
    """
    from docutils import core

    description = view_cls.__doc__ or ''
    config = Config(napoleon_use_param=False, napoleon_use_rtype=False)
    description = GoogleDocstring(description, config=config)
    description = formatting.dedent(smart_text(description))
    if html:
        parts = core.publish_parts(source=description, writer_name='html')
        html = parts['body_pre_docinfo'] + parts['fragment']
        return mark_safe(html)
    return description
