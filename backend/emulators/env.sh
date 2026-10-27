# The backend's env for the local emulators (#322). Source it, then run
# `npm run dev` or the tests:  . emulators/env.sh && npm run dev
# "demo-" project ids are Firebase's offline convention: nothing reaches GCP.
export FIRESTORE_PROJECT_ID=demo-gcos
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export GCS_BUCKET_NAME=demo-gcos.appspot.com
export STORAGE_EMULATOR_HOST=http://127.0.0.1:9199
