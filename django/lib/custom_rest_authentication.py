from rest_framework.authentication import SessionAuthentication


# See http://stackoverflow.com/questions/30871033
class CsrfExemptSessionAuthentication(SessionAuthentication):

    def enforce_csrf(self, request):
        return  # Do not perform any CSRF validation.
