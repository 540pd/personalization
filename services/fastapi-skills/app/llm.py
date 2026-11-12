"""The model behind the AI draft helper (#511, PACK PY-04 scope 7): one small
interface, so the helper can be tested with deterministic answers and the
production model swapped by config. Model output is untrusted data."""
from typing import Protocol
from .config import Settings


class LLMClient(Protocol):
    async def generate(self, prompt: str) -> str:
        """The model's text for `prompt`. Raises on any model or transport failure."""
        ...


class GeminiClient:
    """Gemini on Vertex AI (google-genai), configured from Settings."""
    def __init__(self, cfg: Settings):
        self.cfg = cfg

    async def generate(self, prompt: str) -> str:
        from google import genai
        from google.genai import types
        client = genai.Client(vertexai=True, project=self.cfg.google_cloud_project, location=self.cfg.vertex_location)
        try:
            response = await client.aio.models.generate_content(
                model=self.cfg.skill_helper_model,
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=self.cfg.skill_helper_max_output_tokens),
            )
        finally:
            await client.aio.aclose()
        return response.text or ''


class FakeLLMClient:
    """Deterministic answers, for tests and local runs without Vertex AI.
    `answers` are returned in turn (the last one repeats); an Exception is raised."""
    def __init__(self, answers=None):
        self.answers = list(answers or [DEFAULT_FAKE_DRAFT])
        self.prompts: list[str] = []

    async def generate(self, prompt: str) -> str:
        self.prompts.append(prompt)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, BaseException):
            raise answer
        if callable(answer):
            return await answer(prompt)
        return answer


DEFAULT_FAKE_DRAFT = '''---
name: fake-draft
description: A placeholder draft from the fake model client.
---
# Purpose
Placeholder text: SKILL_HELPER_BACKEND=fake answers without calling a model.
'''


def llm_client(cfg: Settings) -> LLMClient:
    """The configured backend: `gemini` (default) or `fake`."""
    if cfg.skill_helper_backend == 'fake':
        return FakeLLMClient()
    if cfg.skill_helper_backend != 'gemini':
        raise RuntimeError(f'SKILL_HELPER_BACKEND must be gemini or fake, got {cfg.skill_helper_backend!r}')
    return GeminiClient(cfg)
