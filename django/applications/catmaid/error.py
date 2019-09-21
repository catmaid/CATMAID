# -*- coding: utf-8 -*-


class ClientError(ValueError):
    """Client errors are the result of bad values or requests by the client. In
    the general case this will result in a status 400 error.
    """
    status_code = 400
