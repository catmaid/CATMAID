FROM ubuntu:20.04
LABEL maintainer="Andrew Champion <andrew.champion@gmail.com>, Tom Kazimiers <tom@voodoo-arts.net>"

# For building the image, let dpkg/apt know that we install and configure
# non-interactively.
ARG DEBIAN_FRONTEND=noninteractive

# Install dependencies. Even though this image doesn't run its own Postgres
# instance, make sure we install the upstream version to match the manual (and
# make building images on top of this one easier).
RUN apt-get update -y \
    && apt-get install -y apt-utils apt-transport-https ca-certificates gnupg \
    && apt-get install -y gawk wget software-properties-common \
    && apt-get update -y \
    && wget --quiet -O - "https://keys.openpgp.org/vks/v1/by-fingerprint/0A9AF2115F4687BD29803A206B73A36E6026DFCA" | gpg --dearmor | tee /usr/share/keyrings/com.rabbitmq.team.gpg > /dev/null \
    && wget --quiet -O - "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xf77f1eda57ebb1cc" | gpg --dearmor | tee /usr/share/keyrings/net.launchpad.ppa.rabbitmq.erlang.gpg > /dev/null \
    && wget --quiet -O - "https://packagecloud.io/rabbitmq/rabbitmq-server/gpgkey" | gpg --dearmor | tee /usr/share/keyrings/io.packagecloud.rabbitmq.gpg > /dev/null \
    && echo "deb [signed-by=/usr/share/keyrings/net.launchpad.ppa.rabbitmq.erlang.gpg] http://ppa.launchpad.net/rabbitmq/rabbitmq-erlang/ubuntu focal main" > /etc/apt/sources.list.d/rabbitmq.list \
    && echo "deb [signed-by=/usr/share/keyrings/io.packagecloud.rabbitmq.gpg] https://packagecloud.io/rabbitmq/rabbitmq-server/ubuntu focal main" >> /etc/apt/sources.list.d/rabbitmq.list \
    && wget --quiet -O - https://postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - > /dev/null \
    && add-apt-repository "deb https://apt.postgresql.org/pub/repos/apt/ focal-pgdg main" \
    && add-apt-repository ppa:deadsnakes/ppa \
    && add-apt-repository -y ppa:nginx/stable \
    && apt-get update -y \
    && apt-get install -y python3.9 python3.9-venv python3.9-dev git python3-pip \
    && apt-get install -y nginx supervisor \
    && apt-get install -y rabbitmq-server \
    && rm -rf /var/lib/apt/lists/*
COPY packagelist-ubuntu-apt.txt /home/
RUN apt-get update -y  \
    && xargs apt-get install -y < /home/packagelist-ubuntu-apt.txt \
    && rm -rf /var/lib/apt/lists/*
COPY django/requirements.txt django/requirements-async.txt django/requirements-production.txt /home/django/

RUN /usr/bin/python3.9 -m venv --upgrade-deps --prompt catmaid /home/env \
    && /home/env/bin/pip install -r /home/django/requirements.txt \
    && /home/env/bin/pip install -r /home/django/requirements-async.txt \
    && /home/env/bin/pip install -r /home/django/requirements-production.txt

COPY . /home/

# Add Git commit build information to container by copying the Git repo (.git
# folder) into the container to run "git describe" and pipe its result in the
# file /home/git-version. After this is done, the repo is removed again from the
# container. We expect the environment to have a full git history, including
# tags. For DockerHub this is ensured with a post_checkout hook.
COPY .git /home/.git
RUN cd /home/ && git describe > /home/git-version && rm -r /home/.git

# uWSGI setup
RUN /home/env/bin/pip install uwsgi \
    && ln -s /home/scripts/docker/supervisor-catmaid.conf /etc/supervisor/conf.d/ \
    && mkdir -p /var/run/catmaid \
    && chown www-data /var/run/catmaid \
    && chmod +x /home/scripts/docker/start-catmaid.sh \
    && chmod +x /home/scripts/docker/start-celery.sh \
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
