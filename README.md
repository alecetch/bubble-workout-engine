# Dev Services

## MinIO (S3-compatible)
- Console: `http://localhost:9001`
- Credentials: values from `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` (configured in `docker-compose.yml`)
- Planned bucket name: `media-assets`
- API env for public URL generation: `S3_PUBLIC_BASE_URL` (dev: `http://localhost:9000/media-assets`)
- Verification (bucket exists): `docker compose run --rm minio-init /bin/sh -c "mc alias set local http://minio:9000 ${MINIO_ROOT_USER:-minioadmin} ${MINIO_ROOT_PASSWORD:-minioadmin} >/dev/null && mc ls local | grep media-assets"`
- Seed images source folder: `assets/media-assets/`
- To add or replace images: drop files into `assets/media-assets/` and run `docker compose run --rm minio-seed`
- Verify a seeded file in browser: `http://localhost:9000/media-assets/program_day/mixed_full_body.png`
