from catmaid.models import DataSource


def normalize_source_url(source_url):
    if not source_url:
        # To represent this instance
        return ''
    if source_url[-1] == '/':
        source_url = source_url[:-1]
    return source_url


def get_data_source(project_id, source_url, source_project_id, user_id):
    source_url = normalize_source_url(source_url)
    data_source, _ = DataSource.objects.get_or_create(project_id=project_id,
            url=source_url, source_project_id=source_project_id, defaults={
                'user_id': user_id,
            })
    return data_source
