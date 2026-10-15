# Production secrets

Create these four files outside the repository. Their parent directory must be
owned by root with mode `0700`. Because standalone Docker Compose mounts local
secret files without changing their numeric ownership, use these file owners
and modes:

- `db_admin_password`: `root:root`, mode `0400`
- `db_migration_password`: `root:root`, mode `0400`
- `db_app_password`: numeric `1000:1000`, mode `0400`
- `waitlist_hash_secret`: numeric `1000:1000`, mode `0400`

Generate independent values; do not reuse passwords. PostgreSQL passwords can
be generated with `openssl rand -base64 36`. Generate the HMAC secret with
`openssl rand -hex 32`. Each file must contain only its value and a final
newline. Set `AROMAN_SECRETS_DIR` in the restricted production environment file
to their parent directory.

UID/GID 1000 is the non-root `node` identity pinned by the application image.
The root-only parent prevents host users with a coincidentally matching UID
from traversing the directory. Recheck the image UID before changing the base
image. Compose mounts the values as read-only files. It does not place them in image
build arguments or resolved service environment values. Never run a resolved
`docker compose config` command into a public log, and never add the real
secret directory to Git.
