#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# This script will create a new CATMAID release based on the current branch and
# date. Specifically, it does the following:
#
# 1. Determines release name from date and prompts for confirmation
# 2. Creates release branch
# 3. Creates release commit updating CHANGELOG.md and API_CHANGELOG.md headers
#    and contributor list, prompting for confirmation of contributor list,
#    updating Sphinx version and release
# 4. Pushes release branch
# 5. Tags release branch with notes pulled from top changelog section
# 6. Merges release branch to working dev branch
# 7. Sets up new under development sections for CHANGELOG.md and
#    API_CHANGELOG.md from template and commits to dev
#
# Its dependencies are part of the requirements-dev.txt file.
#

import os
import re
import readline
import sh
import sys

from datetime import date
from six.moves import input


def confirm(question, default="yes"):
    valid_options = {"yes": True, "y": True, "no": False, "n": False}
    if default is None:
        prompt = "[y/n]"
    elif default == "yes":
        prompt = "[Y/n]"
    elif default == "no":
        prompt = "[y/N]"
    else:
        raise ValueError("Invalid default answer: {}".format(default))

    while True:
        sys.stdout.write("{} {} ".format(question, prompt))
        choice = input().lower()
        if default is not None and choice == '':
            return valid_options[default]
        elif choice in valid_options:
            return valid_options[choice]
        else:
            sys.stdout.write("Please respond with 'yes' or 'no' "
                             "(or 'y' or 'n').\n")

def exit(on_user_wish=True):
    if on_user_wish:
        sys.stdout.write("Canceling on user request\n")
    sys.exit()

def log(message, newline=True):
    sys.stdout.write(message)
    if newline:
        sys.stdout.write("\n")

def rlinput(prompt, prefill=''):
   readline.set_startup_hook(lambda: readline.insert_text(prefill))
   try:
      return input(prompt)
   finally:
      readline.set_startup_hook()


class CatmaidRelease(object):

    changelog_dev_title = "## Under development"
    changelog_contributor_label = "Contributors:"
    api_changelog_dev_title = "## Under development"
    update_dev_title = "# Under development"

    def __init__(self, catmaid_folder):
        self.git = sh.git.bake(_cwd=catmaid_folder)
        self.project_root = self.git("rev-parse", "--show-toplevel").stdout.decode('utf-8').replace('\n', '')
        log("CATMAID directory: {}".format(self.project_root))

        # Determine release name
        today = date.today()
        self.release_name = today.strftime("%Y.%m.%d")

        # Get current commit ID
        self.last_commit_id = self.git("rev-parse", "HEAD").stdout.decode('utf-8').replace('\n', '')
        log("Last commit: {}".format(self.last_commit_id))

        if not confirm("Release name: \"{}\"".format(self.release_name)):
            exit(True)

    def bake(self):
        # Create release branch
        release_branch = "release/{}".format(self.release_name)
        self.git.checkout("-b", release_branch)

        # Update files references a CATMAID version
        self.update_changelog()
        self.update_api_changelog()
        self.update_update_info()
        self.update_version()
        self.update_documentation()

        # Create release commit
        self.git.commit("-a", "-S", "-m", "Release {}".format(self.release_name))

        # Tag commit
        log("Creating tag \"{}\"...".format(self.release_name), False)
        self.git.tag(self.release_name, "HEAD", "-s", "-a", "-m", self.get_tag_message())
        log("done")

    def update_changelog(self):
        def contentfilter(changelog_data):
            # Replace first occurrence of development header
            release_title = "## " + self.release_name
            header_start = changelog_data.find(self.changelog_dev_title)
            if -1 ==  header_start:
                raise ValueError("Couldn't find development title in CHANGELOG.md")
            changelog_data = changelog_data.replace(self.changelog_dev_title, release_title, 1)

            # Get contributor list
            header_end = header_start + len(release_title)
            next_section_start = changelog_data.find("#", header_end)
            if -1 == next_section_start:
                raise ValueError("Couldn't find beginning of nexst section after title")
            contributor_start = changelog_data.find(self.changelog_contributor_label,
                    header_end, next_section_start)

            new_contributor_list = -1 == contributor_start
            if new_contributor_list:
                log("Getting contributors from Git history since HEAD of master (couldn't find it in CHANGELOG.md)")
                contributor_list = self.git("--no-pager", "log", "--format='%aN'", "master..").stdout.decode('utf-8')
                contributor_list = [n.strip("\'") for n in set(contributor_list.strip('\n').split('\n'))]
                contributor_list = ", ".join(contributor_list)
            else:
                contributor_label_end = contributor_start + len(self.changelog_contributor_label)
                contributor_end = changelog_data.find('\n', contributor_start)
                contributor_list = changelog_data[contributor_label_end: contributor_end]
                contributor_list.sort()
                contributor_list = contributor_list.strip(" ") if contributor_list else ""

            if not contributor_list:
                raise ValueError("Couldn't get contributor list")

            log("Please update and confirm the contributor list:")
            contributor_list = rlinput('', contributor_list)

            if not new_contributor_list:
                # Remove existing contributor line
                contributor_end = changelog_data.find('\n', contributor_start)
                changelog_data = changelog_data[0:contributor_start] + \
                    changelog_data[contributor_end + 1:]

            # Insert contributor list into second line after header
            contributor_list_insert = changelog_data.find('\n', header_end + 1) + 1
            changelog_data = changelog_data[0:contributor_list_insert] + \
                "{} {}\n".format(self.changelog_contributor_label, contributor_list) + \
                changelog_data[contributor_list_insert:]

            return changelog_data

        self.update_file("CHANGELOG.md", contentfilter)

    def update_api_changelog(self):
        def contentfilter(api_changelog_data):
            # Replace first occurrence of development header
            api_changelog_data = re.sub("^{}$".format(self.api_changelog_dev_title),
                 "## {}".format(self.release_name), api_changelog_data, 1, re.MULTILINE)

            return api_changelog_data

        self.update_file("API_CHANGELOG.md", contentfilter)

    def update_update_info(self):
        def contentfilter(update_data):
            # Replace first occurrence of development header
            update_data = re.sub("^{}$".format(self.update_dev_title),
                 "## {}".format(self.release_name), update_data, 1, re.MULTILINE)

            return update_data

        self.update_file("UPDATE.md", contentfilter)

    def update_documentation(self):
        def contentfilter(doc_data):
            # Replace first occurrence of 'version' and 'release' fields
            doc_data = re.sub("^version\s=.*$", "version = '{}'".format(self.release_name),
                doc_data, 1, re.MULTILINE)
            doc_data = re.sub("^release\s=.*$", "release = '{}'".format(self.release_name),
                doc_data, 1, re.MULTILINE)

            return doc_data

        self.update_file("sphinx-doc/source/conf.py", contentfilter)

        log("Updating API documentation...", False)
        update_api_doc = sh.make.bake(_cwd=os.path.join(self.project_root, 'sphinx-doc'))
        update_api_doc('apidoc')
        self.git.add(os.path.join(self.project_root, 'sphinx-doc/source/_static/api'))
        log("done")

        log("Updating widget documentation...", False)
        update_widget_doc = sh.make.bake(_cwd=os.path.join(self.project_root, 'sphinx-doc'))
        update_widget_doc('widgetdoc')
        self.git.add(os.path.join(self.project_root, 'sphinx-doc/source/_static/widgets'))
        log("done")


    def update_version(self):
        def contentfilter(doc_data):
            # Set CATMAID's base version
            doc_data = re.sub("^BASE_VERSION\s=.*$", "BASE_VERSION = '{}'".format(self.release_name),
                doc_data, 1, re.MULTILINE)
            doc_data = re.sub("^BASE_COMMIT\s=.*$", "BASE_COMMIT = '{}'".format(self.last_commit_id),
                doc_data, 1, re.MULTILINE)

            return doc_data

        self.update_file("django/projects/mysite/utils.py", contentfilter)


    def update_file(self, relative_path, filterfn):
        data = None
        with open(os.path.join(self.project_root, relative_path), "r") as file:
            data = file.read()
        if not data:
            raise ValueError("Couldn't load {} file".format(relative_path))

        data = filterfn(data)

        # Write out updated file content
        log("Updating {}... ".format(relative_path), False)
        with open(os.path.join(self.project_root, relative_path), "w") as file:
            file.write(data)
        log("done")

    def get_tag_message(self):
        # Load CHANGELOG.md and API_CHANGELOG.md, crop sections for this
        # release and concatenate.
        changelog_data = None
        with open(os.path.join(self.project_root, "CHANGELOG.md"), "r") as file:
            changelog_data = file.read()
        if not changelog_data:
            raise ValueError("Couldn't load CHANGELOG.md file for tag message creation")
        api_changelog_data = None
        with open(os.path.join(self.project_root, "API_CHANGELOG.md"), "r") as file:
            api_changelog_data = file.read()
        if not api_changelog_data:
            raise ValueError("Couldn't load API_CHANGELOG.md file for tag message creation")

        changelog_section_match = re.search("(## {}.*?)## \d\d\d\d\.\d[\d]\.\d[\d]".format(self.release_name),
            changelog_data, re.DOTALL)
        if not changelog_section_match or len(changelog_section_match.groups()) != 1:
            raise ValueError("Couldn't find release section in CHANGELOG.md for tag message")
        changelog_section = changelog_section_match.group(1)

        api_changelog_section_match = re.search("(## {}.*?)## \d\d\d\d\.\d[\d]\.\d[\d]".format(self.release_name),
            api_changelog_data, re.DOTALL)
        if not api_changelog_section_match or len(api_changelog_section_match.groups()) != 1:
            raise ValueError("Couldn't find release section in API_CHANGELOG.md for tag message")
        api_changelog_section = api_changelog_section_match.group(1)

        # Replace all # occurrences with underlines for the text following it.
        tag_message = re.sub("^## {}".format(self.release_name),
            "{}\n{}".format(self.release_name, "=" * len(self.release_name)),
             changelog_section, 1, re.MULTILINE)
        tag_message += re.sub("^## {}".format(self.release_name),
            "## API changes", api_changelog_section, 1, re.MULTILINE)

        def replace_section_header(m):
            matches = m.groups(1)
            if len(matches) != 1:
                raise ValueError("Couldn't parse section header: " + str(matches))
            title = matches[0].lstrip("#").strip(" ")
            replace = "{}\n{}".format(title, "-" * len(title))
            return replace

        tag_message = re.sub("^#\s*(.*)$", replace_section_header, tag_message, flags=re.MULTILINE)
        return tag_message

def main():
    working_dir = os.path.dirname(os.path.realpath(__file__))
    r = CatmaidRelease(working_dir)
    r.bake()

if __name__ == "__main__":
    main()
