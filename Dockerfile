FROM ubuntu:14.04
MAINTAINER Andrew Champion "andrew.champion@gmail.com"

# Install dependencies
RUN apt-get install -y software-properties-common \
    && add-apt-repository -y ppa:nginx/stable \
    && apt-get update -y \
    && apt-get install -y python-pip git \
    && apt-get install -y nginx supervisor uwsgi-plugin-python
ADD . /home/
RUN xargs apt-get install -y < /home/packagelist-ubuntu-14.04-apt.txt
ENV WORKON_HOME /opt/virtualenvs
RUN mkdir -p /opt/virtualenvs \
    && /bin/bash -c "source /usr/share/virtualenvwrapper/virtualenvwrapper.sh \
    && mkvirtualenv catmaid \
    && workon catmaid \
    && pip install -U pip \
    && pip install -r /home/django/requirements.txt"

# Postgres setup
RUN sed -i '/# DO NOT DISABLE!/ilocal catmaid catmaid_user  md5' /etc/postgresql/9.3/main/pg_hba.conf \
    && service postgresql start \
    && /home/scripts/createuser.sh catmaid catmaid_user p4ssw0rd | sudo -u postgres psql --cluster 9.3/main

# CATMAID setup
RUN cp /home/django/configuration.py.example /home/django/configuration.py \
    && sed -i -e "s?^\(abs_catmaid_path = \).*?\1'/home'?g" /home/django/configuration.py \
    && sed -i -e "s?^\(abs_virtualenv_python_library_path = \).*?\1'/opt/virtualenvs/catmaid'?g" /home/django/configuration.py \
    && sed -i -e "s?^\(catmaid_database_name = \).*?\1'catmaid'?g" /home/django/configuration.py \
    && sed -i -e "s?^\(catmaid_database_username = \).*?\1'catmaid_user'?g" /home/django/configuration.py \
    && sed -i -e "s?^\(catmaid_database_password = \).*?\1'p4ssw0rd'?g" /home/django/configuration.py \
    && sed -i -e "s?^\(catmaid_timezone = \).*?\1'America/New_York'?g" /home/django/configuration.py \
    && sed -i -e "s?^\(catmaid_servername = \).*?\1'localhost'?g" /home/django/configuration.py \
    && cd /home/django && python create_configuration.py \
    && mkdir -p /home/django/static
# Django's createsuperuser requires input, so use the Django shell instead.
RUN service postgresql start \
    && /bin/bash -c "source /usr/share/virtualenvwrapper/virtualenvwrapper.sh \
    && workon catmaid \
    && cd /home/django/projects/mysite \
    && python manage.py syncdb --migrate --noinput \
    && python manage.py collectstatic --clear --link --noinput \
    && cat /home/scripts/docker/create_superuser.py | python manage.py shell \
    && python manage.py catmaid_insert_example_projects --user=1"

# nginx and uWSGI setup
RUN pip install uwsgi \
    && echo "daemon off;" >> /etc/nginx/nginx.conf \
    && rm /etc/nginx/sites-enabled/default \
    && ln -s /home/scripts/docker/nginx-catmaid.conf /etc/nginx/sites-enabled/ \
    && ln -s /home/scripts/docker/supervisor-catmaid.conf /etc/supervisor/conf.d/
# Fix AUFS bug that breaks PostgreSQL
# See: https://github.com/docker/docker/issues/783
RUN mkdir /etc/ssl/private-copy; \
    mv /etc/ssl/private/* /etc/ssl/private-copy/; \
    rm -r /etc/ssl/private; \
    mv /etc/ssl/private-copy /etc/ssl/private; \
    chmod -R 0700 /etc/ssl/private; \
    chown -R postgres /etc/ssl/private

EXPOSE 80
WORKDIR /home/django/projects/mysite
CMD ["supervisord", "-n"]
