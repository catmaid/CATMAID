These hooks are used by DockerHub to have more fine grained control over the
Docker image build process. We need it to have docker clone not only a shallow
copy of the CATMAID repository, but the full history. More information can be
found here: https://docs.docker.com/docker-hub/builds/advanced/.
