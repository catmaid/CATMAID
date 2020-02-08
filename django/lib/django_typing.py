from typing import Any


# Mypy recommends doing this via a Protocol, but since Python 3.6 is still
# required, this would require the typing_extension package, which is overkill
# to suppress a lint.
class AdminPropertyAttributes(type):
    admin_order_field: str
    short_description: str

def admin_property_decorator(prop: Any) -> AdminPropertyAttributes:
    return prop
