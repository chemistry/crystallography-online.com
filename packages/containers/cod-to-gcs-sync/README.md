# @chemistry/containers-cod-to-gcs-sync
[![GitHub Build Status](https://github.com/chemistry/crystallography-api/workflows/CI/badge.svg)](https://github.com/chemistry/crystallography-api/actions?query=workflow%3ACI)
[![License: MIT](https://img.shields.io/badge/License-MIT-gren.svg)](https://opensource.org/licenses/MIT)

Container synchronize COD to Google Cloud Storage

## Commands
Build Container
```bash
cd ../../../ && docker build -t gcr.io/crystallography-api/cod-to-gcs-sync -f packages/containers/cod-to-gcs-sync/Dockerfile .
```

Execute container
```bash
docker run --rm -e GCP_SA_KEY="..." --name containers-cod-to-gcs-sync gcr.io/crystallography-api/containers-cod-to-gcs-sync
```

Push container
```bash
# gcloud auth configure-docker
docker push gcr.io/crystallography-api/containers-cod-to-gcs-sync
```

Prepare $GCP_SA_KEY env varible
```
cat credentials.json | base64 >> credentials.base64.json
```

Setting environment variable
```
GCP_SA_KEY=$(cat credentials.json | base64) &&  echo $GCP_SA_KEY
```

## Commands:
  * Build project: `npm run build`