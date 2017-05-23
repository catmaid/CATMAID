FROM ubuntu:16.04
LABEL maintainer="Andrew Champion <andrew.champion@gmail.com>, Tom Kazimiers <tom@voodoo-arts.net"

# Install dependencies. Even though this image doesn't run its own Postgres
# instance, make sure we install the upstream version to match the manual (and
# make building images on top of this one easier).
RUN apt-get update -y \
    && apt-get install -y netcat \
    && apt-get install -y python-pip git \
    && apt-get install -y supervisor uwsgi-plugin-python \
    && apt-get install -y software-properties-common \
    && add-apt-repository -y ppa:nginx/stable \
    && apt-get install -y wget ca-certificates \
    && wget --quiet -O - https://postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
    && add-apt-repository "deb http://apt.postgresql.org/pub/repos/apt/ xenial-pgdg main" \
    && apt-get update -y \
    && apt-get install -y python-pip git \
    && apt-get install -y nginx supervisor uwsgi-plugin-python
ADD packagelist-ubuntu-16.04-apt.txt /home/
RUN xargs apt-get install -y < /home/packagelist-ubuntu-16.04-apt.txt
ADD django/requirements.txt /home/django/
ENV WORKON_HOME /opt/virtualenvs
RUN mkdir -p /opt/virtualenvs \
    && /bin/bash -c "source /usr/share/virtualenvwrapper/virtualenvwrapper.sh \
    && mkvirtualenv catmaid \
    && workon catmaid \
    && pip install -U pip \
    && pip install -r /home/django/requirements.txt"

ADD . /home/

# uWSGI setup
RUN pip install uwsgi \
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
WORKDIR /home/django/projects/mysite
CMD ["platform"]
