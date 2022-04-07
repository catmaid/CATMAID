#!/usr/bin/env python3
from pathlib import Path
import typing as tp
from runpy import run_path

from setuptools import setup
from extreqs import parse_requirement_files

HERE = Path(__file__).resolve().parent

version = run_path(str(HERE / "projects/mysite/utils.py"))["get_version"]()

install_requires, extras_require = parse_requirement_files(
    HERE / "requirements.txt",
    asynch=HERE / "requirements-async.txt",
    dev=HERE / "requirements-dev.txt",
    doc=HERE / "requirements-doc.txt",
    optional=HERE / "requirements-optional.txt",
    production=HERE / "requirements-production.txt",
    test=HERE / "requirements-test.txt",
)

packages: tp.List[str] = []
package_dir: tp.Dict[str, str] = dict()
# for where, kwargs in [
#     ("applications", {}),
#     ("projects", {"include": ["mysite*"]}),
#     ("lib", {})
# ]:
#     for pkg in find_packages(where, **kwargs):
#         packages.append(pkg)
#         components = [where] + pkg.split(".")
#         package_dir[pkg] = os.path.join(*components)

setup(
    name="CATMAID",
    url="https://www.catmaid.org/",
    author="CATMAID development team",
    version=version,
    description="Collaborative Annotation Toolkit for Massive Amounts of Image Data",
    packages=packages,
    package_dir=package_dir,
    install_requires=install_requires,
    extras_require=extras_require,
    python_requires=">=3.8, <4.0",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "License :: OSI Approved :: GNU General Public License v3 (GPLv3)",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
    ],
    setup_requires=["setuptools", "wheel", "extreqs"],
    # scripts=["projects/manage.py", "projects/run-gevent.py"],
)
