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
    dev_bypass_auth: bool = False

    @property
    def registry_parent(self) -> str:
        return f'projects/{self.google_cloud_project}/locations/{self.registry_location}'


@lru_cache

def settings() -> Settings:
    return Settings()
