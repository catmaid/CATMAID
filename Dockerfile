FROM ubuntu:22.04
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
    && echo "deb [signed-by=/usr/share/keyrings/net.launchpad.ppa.rabbitmq.erlang.gpg] http://ppa.launchpad.net/rabbitmq/rabbitmq-erlang/ubuntu jammy main" > /etc/apt/sources.list.d/rabbitmq.list \
    && wget --quiet -O - "https://packagecloud.io/rabbitmq/rabbitmq-server/gpgkey" | gpg --dearmor | tee /usr/share/keyrings/io.packagecloud.rabbitmq.gpg > /dev/null \
    && echo "deb [signed-by=/usr/share/keyrings/io.packagecloud.rabbitmq.gpg] https://packagecloud.io/rabbitmq/rabbitmq-server/ubuntu jammy main" >> /etc/apt/sources.list.d/rabbitmq.list \
    && wget --quiet -O - https://postgresql.org/media/keys/ACCC4CF8.asc > /usr/share/keyrings/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/keyrings/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt jammy-pgdg main" >> /etc/apt/sources.list.d/pgdg.list \
    && wget --quiet -O - "https://nginx.org/keys/nginx_signing.key" | gpg --dearmor | tee /usr/share/keyrings/org.nginx.gpg > /dev/null \
    && echo "deb [signed-by=/usr/share/keyrings/org.nginx.gpg] http://nginx.org/packages/ubuntu/ jammy nginx" >> /etc/apt/sources.list.d/nginx.list \
    && wget --quiet -O - "https://cloud.r-project.org/bin/linux/ubuntu/marutter_pubkey.asc" | gpg --dearmor | tee /usr/share/keyrings/cran.gpg > /dev/null \
    && echo "deb [signed-by=/usr/share/keyrings/cran.gpg] https://cloud.r-project.org/bin/linux/ubuntu jammy-cran40/" >> /etc/apt/sources.list.d/cran.list \
    && apt-get update -y \
    && apt-get install -y python3.10 python3.10-venv python3.10-dev git python3-pip \
    && apt-get install -y postgresql-13 postgresql-13-postgis-3 \
    && apt-get install -y nginx supervisor \
    && apt-get install -y rabbitmq-server \
    && apt-get install -y r-base r-base-dev mesa-common-dev libglu1-mesa-dev \
        libssl-dev libssh2-1-dev libcurl4-openssl-dev cmtk \
    && rm -rf /var/lib/apt/lists/*
COPY packagelist-ubuntu-apt.txt /home/
RUN apt-get update -y  \
    && xargs apt-get install -y < /home/packagelist-ubuntu-apt.txt \
    && rm -rf /var/lib/apt/lists/*

# Set the locale
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

COPY django/requirements.txt django/requirements-async.txt django/requirements-doc.txt django/requirements-optional.txt django/requirements-production.txt /home/django/

RUN /usr/bin/python3.10 -m venv --upgrade-deps --prompt catmaid /home/env \
    && /home/env/bin/pip install -U pip \
    && /home/env/bin/pip install -r /home/django/requirements.txt \
    && /home/env/bin/pip install -r /home/django/requirements-async.txt \
    && /home/env/bin/pip install -r /home/django/requirements-optional.txt \
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
