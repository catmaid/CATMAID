The localhost.pem certificate file should NEVER be used for actual encryption
and identity purposes. The private key is included on purpose to make local
image data serving a little bit easier. A certificate with the same properties
can be generated the following way:

```
openssl req -new -x509 -keyout localhost.pem -out localhost.pem -days 24855 -nodes
```

Again: NEVER use the included localhost.pem certificate for security.
