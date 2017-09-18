import imp
import sys
import logging
import re

logger = logging.getLogger('catmaid')
logger.setLevel(logging.INFO)
logger.addHandler(logging.StreamHandler(sys.stdout))

# Regular expression should be able to parse version strings such as
# '3.0.0rc4-CAPI-1.3.3', '3.0.0-CAPI-1.4.1', '3.4.0dev-CAPI-1.8.0' or '3.4.0dev-CAPI-1.8.0 r0'
# or  '3.6.2-CAPI-1.10.2 4d2925d6'.
version_regex = re.compile(
    r'^(?P<version>(?P<major>\d+)\.(?P<minor>\d+)\.(?P<subminor>\d+))'
    r'((rc(?P<release_candidate>\d+))|dev)?-CAPI-(?P<capi_version>\d+\.\d+\.\d+)( r\d+)?( [a-f0-9]+)?$'
)

def patch():
    """Patch libgeos module of contrib.gis to deal with recent version
    representation changes in GEOS. This will temporary add a custom importer,
    load the problematic module, patch it and unload the custom importer again.
    """

    # Add custom importer
    importer = CustomImporter()
    sys.meta_path.append(importer)

    # Import GEOS module to trigger import, which allows us to patch
    import django.contrib.gis.geos

    # Remove importer again
    sys.meta_path.remove(importer)

class CustomImporter(object):

     libgeos_modulename = 'libgeos'
     libgeos_module = 'django.contrib.gis.geos.libgeos'

     def find_module(self, fullname, path=None):
        """This method is called by Python if this class is on sys.path.
        fullname is the fully-qualified name of the module to look for, and path
        is either __path__ (for submodules and subpackages) or None (for a
        top-level module/package).

        Note that this method will be called every time an import statement
        is detected (or __import__ is called), before Python's built-in
        package/module-finding code kicks in.  Also note that if this method
        is called via pkgutil, it is possible that path will not be passed as
        an argument, hence the default value.  Thanks to Damien Ayers for
        pointing this out!
        """

        if fullname == self.libgeos_module:
           self.path = path

           # As per PEP #302 (which implemented the sys.meta_path protocol),
           # if fullname is the name of a module/package that we want to
           # report as found, then we need to return a loader object.
           # In this simple example, that will just be self.

           return self

        # If we don't provide the requested module, return None, as per
        # PEP #302.

        return None

     def load_module(self, fullname):
        """This method is called by Python if CustomImporter.find_module does
        not return None. fullname is the fully-qualified name of the
        module/package that was requested."""

        if fullname != self.libgeos_module:
           # Raise ImportError as per PEP #302 if the requested module/package
           # couldn't be loaded. This should never be reached in this
           # simple example, but it's included here for completeness. :)
           raise ImportError(fullname)

        # PEP#302 says to return the module if the loader object (i.e,
        # this class) successfully loaded the module.
        # Note that a regular class works just fine as a module.

        # Load module through other loader
        module_info = imp.find_module(self.libgeos_modulename, self.path)
        module = imp.load_module(fullname, *module_info)

        if module:
            module.version_regex = version_regex
            sys.modules[fullname] = module
            logger.info("CATMAID patched libgeos version parsing to be compatible with Django 1.10")

            return module
        else:
            raise ImportError("Could not load: " + fullname)
