import sys
import logging

def set_log_level(logger, verbosity=1):
    """This sets the log level of the passed in logger according to the
    management command verbosity.
    """
    handler = logging.StreamHandler(sys.stderr)
    logger.addHandler(handler)

    if verbosity == 0:
        logger.setLevel(logging.WARN)
    elif verbosity == 1:
        logger.setLevel(logging.INFO)
    elif verbosity > 1:
        logger.setLevel(logging.DEBUG)

    if verbosity > 2:
        # Enable statements taht reach the root logger.
        logging.getLogger().setLevel(logging.DEBUG)
