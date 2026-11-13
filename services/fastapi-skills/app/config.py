from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    google_cloud_project: str = 'test-project'
    firestore_project_id: str = 'test-project'
    registry_location: str = 'us'
    registry_api_version: str = 'v1alpha'
    registry_base_url: str = 'https://agentregistry.googleapis.com'
    fastapi_audience: str = ''
    node_service_account: str = ''
    vertex_location: str = 'us-central1'
    skill_helper_model: str = 'gemini-3.5-flash-lite'
    skill_helper_max_output_tokens: int = 2048
    # The helper's bounds (#511). Placeholders until agreed.
    skill_helper_backend: str = 'gemini'           # gemini | fake (fake is refused on Cloud Run)
    skill_helper_timeout_seconds: float = 30       # the Node client's 30 s helper budget (#494)
    skill_helper_drafts_per_hour: int = 20         # per owner
    skill_helper_max_prompt_chars: int = 8000      # the whole prompt, checked before any model call
    # The approved tool catalog (#510): `file` (data/tool_catalog.json) or
    # `registry` (placeholder: fails closed until the Registry catalog exists).
    catalog_source: str = 'file'
    catalog_cache_seconds: float = 60
    # Stuck publishes (#508). Placeholders until agreed.
    publish_upload_deadline_seconds: float = 900   # one that never reached the Registry fails after this
    publish_operation_retention_days: int = 30     # finished operations get expireAt for a Firestore TTL policy
    dev_bypass_auth: bool = False

    @property
    def registry_parent(self) -> str:
        return f'projects/{self.google_cloud_project}/locations/{self.registry_location}'


@lru_cache

def settings() -> Settings:
    return Settings()
