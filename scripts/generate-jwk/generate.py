from jwcrypto.jwk import JWK
import json

key = JWK.generate(kty='RSA', alg='RS256', size=4096)

private_key = key.export_private()
public_key = key.export_public()

print('\n### PRIVATE KEY ###')
print(private_key)
print('\n### PUBLIC KEY ###')
print(public_key)
