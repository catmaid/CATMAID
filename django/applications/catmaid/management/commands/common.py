import sys
import logging


def set_log_level(logger, verbosity=1):
    """This sets the log level of the passed in logger according to the
    management command verbosity.
    """
    handler = logging.StreamHandler(sys.stdout)
    logger.addHandler(handler)

    if verbosity == 0:
        logger.setLevel(logging.WARN)
    elif verbosity == 1:
        logger.setLevel(logging.INFO)
    elif verbosity > 1:
        logger.setLevel(logging.DEBUG)

    if verbosity > 2:
        # Enable statements that reach the root logger.
        logging.getLogger().setLevel(logging.DEBUG)


def ask_a_b(a, b, title):
    """Return true if a, False if b.
    """
    def ask():
        selection = input(title + " ").strip()
        if selection == a:
            return True
        if selection == b:
            return False
        return None

    while True:
        d = ask()
        if d is not None:
            return d
        print(f"Please answer only '{a}' or '{b}'")


def ask_yes_no(title):
    """Return true if yes, False if no.
    """
    return ask_a_b('y', 'n', title)
