# Production secrets

Create the existing application files outside the repository. Their parent
directory must be owned by root with mode `0700`. Because standalone Docker Compose mounts local
secret files without changing their numeric ownership, use these file owners
and modes:

- `db_admin_password`: `root:root`, mode `0400`
- `db_migration_password`: `root:root`, mode `0400`
- `db_app_password`: numeric `1000:1000`, mode `0400`
- `waitlist_hash_secret`: numeric `1000:1000`, mode `0400`

For a separately reviewed, profile-gated bot overlay, also create independent
files for `db_telegram_bot_password`, `db_bale_bot_password`,
`telegram_bot_token`, and `bale_bot_token`. Give each of these four files
numeric owner `1000:1000` and mode `0400` because the workers run as UID 1000.
The separate `db_admin_password` remains `root:root`, mode `0400`, and is
mounted only in the opt-in role setup service. That service also receives both
provider database passwords; each worker receives only its own token and
database password. These bot files are not required by the normal web or
waitlist Compose configuration.

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
