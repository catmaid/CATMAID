# -*- coding: utf-8 -*-
import datetime as dt
from contextlib import contextmanager
import sys

from dateutil.tz import gettz
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.conf import settings

from catmaid.models import *

import logging
logger = logging.getLogger(__name__)
from .common import set_log_level

SEP = "\t"
User = get_user_model()


@contextmanager
def out_stream(fpath):
    if fpath == "-":
        yield sys.stdout
    else:
        with open(fpath, "w") as f:
            yield f


def parse_dt(s):
    timestamp = dt.datetime.fromisoformat(s)
    if timestamp.tzinfo is None:
        timestamp = timestamp.astimezone(gettz(settings.TIME_ZONE))
    return timestamp


class Command(BaseCommand):
    help = 'List users as TSV'

    def add_arguments(self, parser):
        parser.add_argument(
            '-a', '--active', action="store_true", help='Only include active users',
        )
        parser.add_argument(
            '-e', '--email', action="store_true", help='Only include users with email addresses',
        )
        parser.add_argument(
            '-l', '--logged-in-after', type=parse_dt,
            help='Only include users who have logged in since the given ISO-8601 timestamp'
        )
        parser.add_argument(
            '-H', '--header', action='store_true', help='Print a header for the output TSV',
        )
        parser.add_argument(
            '-o', '--outfile', default='-', help='Path to output file, or - for stdout (default)',
        )

    def handle(self, *args, **options):
        set_log_level(logger, options.get('verbosity', 1))

        with out_stream(options["outfile"]) as f:
            if options["header"]:
                headers = ["username", "is_active", "last_login", "email", "name"]
                print(SEP.join(headers), file=f)

            users = User.objects.all()
            if options["active"]:
                users = users.filter(is_active=True)
                logger.debug("Excluding inactive users")
            if options["email"]:
                users = users.filter(email__isnull=False)
                logger.debug("Excluding users without email addresses")
            if options["logged_in_after"]:
                users = users.filter(last_login__isnull=False, last_login__gte=options["logged_in_after"])
                logger.debug("Excluding users without login since %s", options["logged_in_after"])

            for user in users:
                last_login_dt = user.last_login
                if last_login_dt:
                    last_login = last_login_dt.isoformat()
                else:
                    last_login = ""

                fields = [
                    user.get_username(),
                    str(int(user.is_active)),
                    last_login,
                    user.email or "",
                    user.get_full_name() or "",
                ]
                print(SEP.join(fields), file=f)
