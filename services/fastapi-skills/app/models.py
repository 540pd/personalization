from typing import Annotated, Literal
from pydantic import BaseModel, Field, field_validator
import re

SLUG = re.compile(r'^[a-z][a-z0-9-]{2,32}[a-z0-9]$')


class SkillCreate(BaseModel):
    slug: str = Field(min_length=4, max_length=34)
    display_name: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=10, max_length=500)

    @field_validator('slug')
    @classmethod
    def valid_slug(cls, value):
        if not SLUG.fullmatch(value):
            raise ValueError('slug must be 4-34 lowercase letters/digits/hyphens, start with a letter and end in a digit/letter')
        return value


class SkillUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, min_length=10, max_length=500)


class PublishRequest(BaseModel):
    markdown: str = Field(min_length=25, max_length=102400)
    tool_names: list[str] = Field(default_factory=list, max_length=30)


class ToolValidationRequest(BaseModel):
    tool_names: list[str] = Field(default_factory=list, max_length=30)


class SkillDraftRequest(BaseModel):
    name: str = Field(min_length=4, max_length=50)
    goal: str = Field(min_length=15, max_length=2500)
    # Each item bounded too (#511): the list's length alone let one item be any size.
    constraints: list[Annotated[str, Field(min_length=1, max_length=300)]] = Field(default_factory=list, max_length=15)
    approved_tools: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(default_factory=list, max_length=20)


class ToolResult(BaseModel):
    name: str
    approved: bool
    reason: str
    # Whether the catalog has an input schema for this tool (#510).
    input_schema: bool = False


class ToolValidationResponse(BaseModel):
    valid: bool
    results: list[ToolResult]
    # Which catalog this was checked against (#510).
    catalog_revision: str = ''



class DraftIssue(BaseModel):
    code: str
    path: str
    message: str


class SkillDraftResponse(BaseModel):
    markdown: str
    approved_tools: list[str]
    warning: str = 'Draft only; review and explicitly publish. No Registry write occurred.'
    # The draft's own tool declarations, checked (#509). Not valid: fix before publishing.
    valid: bool = True
    issues: list[DraftIssue] = []


class PublishStatus(BaseModel):
    operation_id: str
    status: Literal['pending', 'publishing', 'pending_activation', 'published', 'failed']
    revision: str | None = None
    registry_operation: str | None = None
    error: str | None = None
    # The tool catalog revision this publish was validated against (#510).
    catalog_revision: str | None = None
