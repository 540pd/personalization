# Official references to verify during implementation

- Google Agent Runtime with ADK: https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/runtime/quickstart-adk
- Agent Registry / ADK client integration: https://docs.cloud.google.com/agent-registry/reference/libraries
- Single-agent ADK + MCP architecture: https://docs.cloud.google.com/architecture/single-agent-ai-system-adk-cloud-run
- Cloud Tasks authenticated HTTP dispatch and retry semantics: https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks
- Cloud Tasks max HTTP dispatch deadline (30 min): https://docs.cloud.google.com/tasks/docs/quotas

Do not freeze model IDs or SDK method signatures based only on examples; check availability, permissions, deployment region and version against current docs. New task pack deliberately does not assume the old temporary Python direct-Vertex adapter is valid.
