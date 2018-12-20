FROM ubuntu:16.04
LABEL maintainer="Andrew Champion <andrew.champion@gmail.com>, Tom Kazimiers <tom@voodoo-arts.net>"

# For building the image, let dpkg/apt know that we install and configure
# non-interactively.
ARG DEBIAN_FRONTEND=noninteractive

# Install dependencies. Even though this image doesn't run its own Postgres
# instance, make sure we install the upstream version to match the manual (and
# make building images on top of this one easier).
RUN apt-get update -y \
    && apt-get install -y apt-utils gawk \
    && apt-get install -y software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && add-apt-repository -y ppa:nginx/stable \
    && add-apt-repository "deb http://apt.postgresql.org/pub/repos/apt/ xenial-pgdg main" \
    && apt-get install -y wget ca-certificates \
    && wget --quiet -O - https://postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
    && apt-get update -y \
    && apt-get install -y python3.6 python3.6-dev git python-pip \
    && apt-get install -y nginx supervisor \
    && rm -rf /var/lib/apt/lists/*
ADD packagelist-ubuntu-16.04-apt.txt /home/
RUN apt-get update -y  \
    && xargs apt-get install -y < /home/packagelist-ubuntu-16.04-apt.txt \
    && rm -rf /var/lib/apt/lists/*
ADD django/requirements.txt /home/django/
ENV WORKON_HOME /opt/virtualenvs
RUN mkdir -p /opt/virtualenvs \
    && /bin/bash -c "source /usr/share/virtualenvwrapper/virtualenvwrapper.sh \
    && mkvirtualenv catmaid -p /usr/bin/python3.6 \
    && workon catmaid \
    && pip install -U pip setuptools \
    && pip install -r /home/django/requirements.txt"

ADD . /home/

# Add Git commit build information to container by creating the files
# /home/git-commit and /home/git-base-count. The former is a file with the
# commit ID tof the enclosing git environment. The latter file contains the
# number of commits from this commit to the reference commit stored in the file
# django/projects/mysite/utils.py. This is needed, because we can't expect the
# git environment to have all git names (DockerHub doesn't). Otherwise we could
# use git describe.
COPY .git /home/.git
RUN cd /home/ \
    && cat /home/.git/$(cat /home/.git/HEAD | awk '{print $2}') > /home/git-commit \
    && commit=$(grep -i -o '^BASE_COMMIT.*=.\+$' /home/django/projects/mysite/utils.py | sed -e "s/.*=\s\+['\"]\(.*\)['\"]$/\1/") \
    && git rev-list --count $commit.. > /home/git-base-count

# uWSGI setup
RUN /bin/bash -c "source /usr/share/virtualenvwrapper/virtualenvwrapper.sh \
    && workon catmaid \
    && pip install uwsgi" \
    && ln -s /home/scripts/docker/supervisor-catmaid.conf /etc/supervisor/conf.d/ \
    && chmod +x /home/scripts/docker/start-catmaid.sh \
    && chmod +x /home/scripts/docker/catmaid-entry.sh

# Fix AUFS bug that breaks PostgreSQL
# See: https://github.com/docker/docker/issues/783
RUN mkdir /etc/ssl/private-copy; \
    mv /etc/ssl/private/* /etc/ssl/private-copy/; \
    rm -r /etc/ssl/private; \
    mv /etc/ssl/private-copy /etc/ssl/private; \
    chmod -R 0700 /etc/ssl/private; \
    chown -R postgres /etc/ssl/private

ENTRYPOINT ["/home/scripts/docker/catmaid-entry.sh"]

EXPOSE 8000
WORKDIR /home/django/projects/
CMD ["platform"]
