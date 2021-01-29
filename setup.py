#!/usr/bin/env python3
from pathlib import Path
from itertools import chain

from setuptools import find_packages, setup

PROJECT_DIR = Path(__file__).resolve().parent

def parse_reqs(fpath: Path):
    """Works for simple requirements files like ours.

    More complex requirements files may require pkg_resources.parse_requirements.
    """
    with open(fpath) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("-r"):
                yield from parse_reqs(fpath.parent / line[2:].lstrip())
            else:
                yield line


def parse_extra(name: str):
    yield from parse_reqs(PROJECT_DIR / "django" / f"requirements-{name}.txt")


def get_package_dirs(*dpaths):
    packages = []
    package_dirs = dict()
    for dpath in dpaths:
        for pkg in find_packages(dpath):
            packages.append(pkg)
            items = pkg.split(".")
            package_dirs[pkg] = str(dpath.joinpath(*items))
    return packages, package_dirs


install_requires = list(parse_reqs(PROJECT_DIR / "django" / "requirements.txt"))

extras_require = {
    name: list(parse_extra(name))
    for name in ("async", "dev", "doc", "optional", "test")
}
extras_require["all"] = sorted(set(chain.from_iterable(extras_require.values())))

django_dir = PROJECT_DIR / "django"
packages, package_dir = get_package_dirs(django_dir / "applications", django_dir / "projects", django_dir / "lib")

setup(
    name="CATMAID",
    use_scm_version=True,
    setup_requires=['setuptools_scm'],
    url="https://github.com/catmaid/CATMAID",
    project_urls={
        "Documentation": "https://catmaid.org",
        "Source": "https://github.com/catmaid/CATMAID",
    },
    author="CATMAID developers",
    description="Collaborative Annotation Tool for Massive Amounts of Image Data",
    packages=packages,
    package_dir=package_dir,
    install_requires=install_requires,
    extras_require=extras_require,
    scripts=[str(django_dir / "projects" / "manage.py")]
)
